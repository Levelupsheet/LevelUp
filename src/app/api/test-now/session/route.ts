import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureUser } from "@/app/api/_lib/ensureUser";
import { getRequestUserId } from "@/app/api/_lib/authUser";
import { evaluateQuestionAnswer, normalizeDifficultyLevel, shuffleQuestionPayload } from "@/lib/questionTransforms";
import { normalizeQuestionType } from "@/lib/questionTypes";
import { buildQuestionBankSelection } from "@/lib/questionBank";
import { calculateConfidenceScore, recordQuestionExposure, upsertQuestionCalibration, upsertUserSkillFromAnswer } from "@/lib/adaptiveEngine";
import { getSweepstakesCampaignMetaMap } from "@/lib/sweepstakesCampaignMeta";
import { awardRaffleEntries, getOrCreateActiveGoldenSweepstakes } from "@/lib/raffle";
import { buildQuestionExplanation } from "@/lib/explanations";

async function ensureGoldenQuestionHistoryTable() {
  try {
    await (prisma as any).$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "GoldenQuestionHistory" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "level" INTEGER NOT NULL,
        "sessionId" TEXT,
        "questionId" TEXT,
        "awarded" BOOLEAN NOT NULL DEFAULT FALSE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await (prisma as any).$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "GoldenQuestionHistory_user_level_idx" ON "GoldenQuestionHistory" ("userId", "level")`);
    await (prisma as any).$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "GoldenQuestionHistory_session_idx" ON "GoldenQuestionHistory" ("sessionId")`);
  } catch {}
}

function mapQuestion(q: any) {
  const rawData = q.data && typeof q.data === "object" ? q.data : {};
  const choices = Array.isArray(q.choices) ? q.choices : Array.isArray((rawData as any)?.choices) ? (rawData as any).choices : [];
  const correctIndex = typeof q.correctIndex === "number" ? q.correctIndex : typeof (rawData as any)?.correctIndex === "number" ? (rawData as any).correctIndex : null;
  return {
    id: q.id,
    type: normalizeQuestionType(q.type),
    prompt: q.prompt,
    choices,
    correctIndex,
    data: rawData,
    explanation: q.explanation,
    difficulty: normalizeDifficultyLevel(q.difficulty),
    level: normalizeDifficultyLevel(q.difficulty),
    tags: q.tags,
    domainId: q.domainId ? String(q.domainId).toLowerCase() : Array.isArray(q.tags) && q.tags[0] ? String(q.tags[0]).toLowerCase() : undefined,
    subdomain: q.subdomain ? String(q.subdomain).toLowerCase() : ((rawData as any)?.subdomain ? String((rawData as any).subdomain).toLowerCase() : undefined),
    isGoldenEligible: Boolean(q.isGoldenEligible),
    goldenWeight: Number(q.goldenWeight || 1),
    goldenBonusXp: Number(q.goldenBonusXp || 50),
    sessionQuestionId: q.sessionQuestionId ? String(q.sessionQuestionId) : undefined,
    isGolden: Boolean(q.isGolden),
  };
}

function serializeSession(session: any) {
  const questions = (session.questions || [])
    .sort((a: any, b: any) => a.orderIndex - b.orderIndex)
    .map((q: any) => ({ ...(q.payloadJson || {}), sessionQuestionId: q.id, isGolden: q.isGolden, goldenBonusXp: q.goldenBonusXp || 0 }));
  return {
    ok: true,
    session: {
      id: session.id,
      status: session.status,
      currentIndex: session.currentIndex,
      goldenSpawned: session.goldenSpawned,
      questionCount: session.questionCount,
      state: session.stateJson || null,
      createdAt: session.createdAt,
    },
    set: session.setId ? { id: session.setId } : null,
    questions,
  };
}

async function findActiveSession(userId: string) {
  return (prisma as any).gameSession.findFirst({
    where: { userId, mode: "TEST_NOW", status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    include: { questions: { orderBy: { orderIndex: "asc" } } },
  });
}

async function buildNewSession(userId: string, questionCount = 10) {
  const bank = await buildQuestionBankSelection({
    lane: "TEST_NOW",
    questionCount,
    shouldShuffle: true,
    userId,
    sessionState: { wrongStreak: 0, inRecovery: false, typeCounts: {} },
  });
  if (!bank.placements.length || !bank.questions.length) throw new Error("No active Test Now question bank found");

  await ensureGoldenQuestionHistoryTable();
  const primaryPlacement = bank.placements[0];
  const pool = bank.questions.map(mapQuestion);
  const selected = bank.selectedQuestions.map((q: any) => mapQuestion(q));
  const goldenPool = pool.filter((q: any) => q.isGoldenEligible);
  let goldenQuestionId: string | null = null;
  let goldenQuestionIndex: number | null = null;
  let finalQuestions: any[] = [...selected];

  const currentLevel = Math.max(1, Number(Math.floor(((await prisma.user.findUnique({ where: { id: userId }, select: { xp: true } }).catch(() => ({ xp: 0 })) as any).xp || 0) / 500) + 1));
  const alreadyHadGolden = await (prisma as any).$queryRawUnsafe(`SELECT 1 FROM "GoldenQuestionHistory" WHERE "userId" = $1 AND "level" = $2 AND "awarded" = TRUE LIMIT 1`, userId, currentLevel).then((rows: any[]) => Array.isArray(rows) && rows.length > 0).catch(() => false);

  if (!alreadyHadGolden && finalQuestions.length >= 6) {
    const replacementIndex = Math.min(5, Math.max(0, finalQuestions.length - 1));
    goldenQuestionIndex = replacementIndex;
    if (goldenPool.length > 0) {
      const selectedIds = new Set(finalQuestions.map((q: any) => String(q.id || "")));
      const availableGolden = goldenPool.filter((q: any) => !selectedIds.has(String(q.id || "")));
      const weighted = (availableGolden.length ? availableGolden : goldenPool).flatMap((q: any) => Array.from({ length: Math.max(1, Number(q.goldenWeight || 1)) }, () => q));
      const picked = weighted[Math.floor(Math.random() * weighted.length)] || goldenPool[0];
      if (picked) {
        finalQuestions[replacementIndex] = { ...shuffleQuestionPayload(picked), isGolden: true, goldenBonusXp: picked.goldenBonusXp || 50 } as any;
      }
    } else {
      finalQuestions[replacementIndex] = { ...finalQuestions[replacementIndex], isGolden: true } as any;
    }
    goldenQuestionId = String((finalQuestions[replacementIndex] as any).id || `inline-golden-${replacementIndex}`);
  }

  const session = await prisma.$transaction(async (tx: any) => {
    const created = await tx.gameSession.create({
      data: {
        userId,
        mode: "TEST_NOW",
        status: "ACTIVE",
        lane: "TEST_NOW",
        placementId: primaryPlacement.id,
        setId: primaryPlacement.set.id,
        questionCount: finalQuestions.length,
        goldenSpawned: Boolean(goldenQuestionId),
        currentIndex: 0,
        stateJson: { idx: 0, playerHP: 100, enemyHP: 100, correctCount: 0, xpEarned: 0, tier: 1, mastery: {}, timeLeft: 25, lastWasCorrect: null, feedback: null, locked: false, selected: null, finished: false, wrongStreak: 0, inRecovery: false, blueprint: bank.blueprint || [], typeCounts: Object.fromEntries((bank.selectedQuestions || []).reduce((acc: Map<string, number>, q: any) => { const t = String(q?.type || "multiple_choice").toLowerCase(); acc.set(t, (acc.get(t) || 0) + 1); return acc; }, new Map())), },
      },
    });
    for (let i = 0; i < finalQuestions.length; i += 1) {
      const q = finalQuestions[i];
      await tx.gameSessionQuestion.create({
        data: {
          sessionId: created.id,
          questionId: String(q.id || "") || null,
          orderIndex: i,
          payloadJson: { ...q, isGolden: Boolean(goldenQuestionIndex === i) },
          isGolden: Boolean(goldenQuestionIndex === i),
          goldenBonusXp: goldenQuestionIndex === i ? Number(q.goldenBonusXp || 50) : null,
        },
      });
    }
    if (goldenQuestionId) {
      await tx.$executeRawUnsafe(`INSERT INTO "GoldenQuestionHistory" ("id","userId","level","sessionId","questionId","awarded","createdAt") VALUES ($1,$2,$3,$4,$5,FALSE,CURRENT_TIMESTAMP)`, `gqh_${Date.now()}_${Math.random().toString(36).slice(2,8)}`, userId, currentLevel, created.id, goldenQuestionId);
    }
    return tx.gameSession.findUnique({ where: { id: created.id }, include: { questions: { orderBy: { orderIndex: "asc" } } } });
  });
  return session;
}

export async function GET(req: Request) {
  try {
    const userId = String((await getRequestUserId(req)) || "").trim();
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
    const session = await findActiveSession(userId);
    if (!session) return NextResponse.json({ ok: true, session: null, questions: [] });
    return NextResponse.json(serializeSession(session));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load Test Now session" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const userId = String(body?.userId || (await getRequestUserId(req)) || "").trim();
    const questionCount = Math.max(1, Math.min(25, Number(body?.questionCount || 10) || 10));
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
    await ensureUser(userId);
    const existing = await findActiveSession(userId);
    if (existing) return NextResponse.json(serializeSession(existing));
    const session = await buildNewSession(userId, questionCount);
    return NextResponse.json(serializeSession(session));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to create Test Now session" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const sessionId = String(body?.sessionId || "").trim();
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    const currentIndex = Number(body?.currentIndex);
    const state = body?.state && typeof body.state === "object" ? body.state : undefined;
    const status = typeof body?.status === "string" ? String(body.status).toUpperCase() : undefined;
    const answered = Array.isArray(body?.answeredQuestions) ? body.answeredQuestions : [];

    await prisma.$transaction(async (tx: any) => {
      if (answered.length) {
        for (const row of answered) {
          const sessionQuestionId = String(row?.sessionQuestionId || "").trim();
          if (!sessionQuestionId) continue;
          const existingQuestion = await tx.gameSessionQuestion.findUnique({ where: { id: sessionQuestionId } });
          const payload = existingQuestion?.payloadJson && typeof existingQuestion.payloadJson === "object" ? existingQuestion.payloadJson : {};
          const evaluation = evaluateQuestionAnswer({
            type: (payload as any)?.type,
            prompt: (payload as any)?.prompt,
            correctIndex: (payload as any)?.correctIndex,
            choices: Array.isArray((payload as any)?.choices) ? (payload as any).choices : undefined,
            data: (payload as any)?.data,
            answer: row?.selectedAnswer,
          });
          const explanation = buildQuestionExplanation({ question: payload, userAnswer: row?.selectedAnswer, evaluation });
          await tx.gameSessionQuestion.update({
            where: { id: sessionQuestionId },
            data: {
              answered: true,
              isCorrect: evaluation.correct,
              selectedAnswer: row?.selectedAnswer === undefined ? undefined : {
                value: row.selectedAnswer,
                score: Number((evaluation as any)?.score ?? (evaluation.correct ? 1 : 0)),
                partialScore: Number((evaluation as any)?.partialScore ?? (evaluation.correct ? 1 : 0)),
                feedback: {
                  rubric: (evaluation as any)?.feedback ?? null,
                  explanation,
                },
              },
              answeredAt: new Date(),
            },
          });
        }
      }
      await tx.gameSession.update({
        where: { id: sessionId },
        data: {
          currentIndex: Number.isFinite(currentIndex) ? Math.max(0, currentIndex) : undefined,
          stateJson: state,
          status: status === "COMPLETED" ? "COMPLETED" : status === "ABANDONED" ? "ABANDONED" : undefined,
          completedAt: status === "COMPLETED" ? new Date() : undefined,
        },
      });
    });
    await ensureGoldenQuestionHistoryTable();
    const session = await (prisma as any).gameSession.findUnique({ where: { id: sessionId }, include: { questions: { orderBy: { orderIndex: "asc" } } } });

    if (session && answered.length) {
      let wrongStreak = Number((session.stateJson as any)?.wrongStreak || 0);
      let inRecovery = Boolean((session.stateJson as any)?.inRecovery);
      for (const row of answered) {
        const sessionQuestionId = String(row?.sessionQuestionId || "").trim();
        if (!sessionQuestionId) continue;
        const q = (session.questions || []).find((it: any) => String(it.id) === sessionQuestionId);
        const payload = q?.payloadJson && typeof q.payloadJson === "object" ? q.payloadJson : {};
        const evaluation = evaluateQuestionAnswer({
          type: (payload as any)?.type,
          prompt: (payload as any)?.prompt,
          correctIndex: (payload as any)?.correctIndex,
          choices: Array.isArray((payload as any)?.choices) ? (payload as any).choices : undefined,
          data: (payload as any)?.data,
          answer: row?.selectedAnswer,
        });
        const responseMs = Number(row?.responseMs || row?.elapsedMs || 0) || null;
        const hintsUsed = Number(row?.hintsUsed || 0) || 0;
        const attemptsUsed = Number(row?.attempts || 1) || 1;
        const rawScore = Number((evaluation as any)?.score ?? (evaluation.correct ? 1 : 0));
        const confidence = calculateConfidenceScore({ correct: evaluation.correct, score: rawScore, responseMs, hintsUsed, attempts: attemptsUsed });
        wrongStreak = evaluation.correct ? 0 : wrongStreak + 1;
        inRecovery = wrongStreak >= 2;
        await recordQuestionExposure({
          userId: session.userId,
          questionId: String(q?.questionId || (payload as any)?.id || sessionQuestionId),
          domain: String((payload as any)?.domainId || (payload as any)?.data?.domainId || "GENERAL"),
          subdomain: String((payload as any)?.subdomain || (payload as any)?.data?.subdomain || "GENERAL"),
          questionType: String((payload as any)?.type || "multiple_choice"),
          isCorrect: evaluation.correct,
          score: rawScore,
        });
        await upsertQuestionCalibration({
          questionId: String(q?.questionId || (payload as any)?.id || sessionQuestionId),
          isCorrect: evaluation.correct,
          responseMs,
        });
        await upsertUserSkillFromAnswer({
          userId: session.userId,
          question: {
            id: String((payload as any)?.id || q?.questionId || sessionQuestionId),
            type: String((payload as any)?.type || "multiple_choice"),
            domainId: String((payload as any)?.domainId || (payload as any)?.data?.domainId || "general"),
            subdomain: String((payload as any)?.subdomain || (payload as any)?.data?.subdomain || "GENERAL"),
            level: Number((payload as any)?.level || (payload as any)?.difficulty || 1),
            data: (payload as any)?.data,
          },
          isCorrect: evaluation.correct,
          score: rawScore,
          responseMs,
          hintsUsed,
          attempts: attemptsUsed,
        });
        await prisma.gameSession.update({ where: { id: session.id }, data: { stateJson: { ...((session.stateJson as any) || {}), wrongStreak, inRecovery, lastConfidence: confidence, lastPartialScore: Number((evaluation as any)?.partialScore ?? rawScore) } } }).catch(() => null);
      }
    }
    let goldenAwarded = false;
    if (session && answered.length) {
      const activeCampaign = await getOrCreateActiveGoldenSweepstakes(prisma as any).catch(() => null);
      if (activeCampaign) {
        const metaMap = await getSweepstakesCampaignMetaMap().catch(() => new Map());
        const meta = metaMap.get(String(activeCampaign.id));
        if (meta?.allowGoldenQuestion || true) {
          for (const row of answered) {
            const sessionQuestionId = String(row?.sessionQuestionId || "").trim();
            if (!sessionQuestionId) continue;
            const q = (session.questions || []).find((it: any) => String(it.id) === sessionQuestionId);
            const payload = q?.payloadJson && typeof q.payloadJson === "object" ? q.payloadJson : {};
            const evaluation = evaluateQuestionAnswer({
              type: (payload as any)?.type,
              prompt: (payload as any)?.prompt,
              correctIndex: (payload as any)?.correctIndex,
              choices: Array.isArray((payload as any)?.choices) ? (payload as any).choices : undefined,
              data: (payload as any)?.data,
              answer: row?.selectedAnswer,
            });
            if (evaluation.correct !== true) continue;
            if (!q?.isGolden) continue;
            const already = await (prisma as any).$queryRawUnsafe(`SELECT 1 FROM "GoldenQuestionHistory" WHERE "sessionId" = $1 AND "questionId" = $2 AND "awarded" = TRUE LIMIT 1`, session.id, String(q.questionId || q.id)).then((rows: any[]) => Array.isArray(rows) && rows.length > 0).catch(() => false);
            if (already) continue;
            await prisma.$transaction(async (tx: any) => {
              const award = await awardRaffleEntries(tx as any, {
                userId: session.userId,
                source: "GOLDEN_QUESTION",
                quantity: 1,
                campaignId: activeCampaign.id,
                sourceRefType: "QUESTION",
                sourceRefId: String(q.questionId || q.id),
                auditKey: `golden-question:${String(q.questionId || q.id)}:${String(session.id)}`,
                meta: { sessionId: session.id, questionId: q.questionId } as any,
              });
              if (Number(award?.awarded || 0) > 0) {
                await tx.notification.create({ data: { userId: session.userId, type: 'SWEEPSTAKES_ENTRY', title: 'Golden sweepstakes entry added', body: `+${Number(award.awarded || 0)} golden entry added to the active golden sweepstakes.` } }).catch(() => null);
              }
              await tx.$executeRawUnsafe(`UPDATE "GoldenQuestionHistory" SET "awarded" = TRUE WHERE "sessionId" = $1 AND "questionId" = $2`, session.id, String(q.questionId || q.id));
            }).catch(() => null);
            goldenAwarded = true;
          }
        }
      }
    }
    return NextResponse.json({ ...serializeSession(session), goldenAwarded });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to update Test Now session" }, { status: 500 });
  }
}
