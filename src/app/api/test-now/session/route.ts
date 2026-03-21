import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureUser } from "@/app/api/_lib/ensureUser";
import { getRequestUserId } from "@/app/api/_lib/authUser";
import { normalizeDifficultyLevel, sampleQuestions, shuffleQuestionPayload } from "@/lib/questionTransforms";
import { normalizeQuestionType } from "@/lib/questionTypes";
import { getSweepstakesCampaignMetaMap } from "@/lib/sweepstakesCampaignMeta";
import { awardRaffleEntries } from "@/lib/raffle";
import { levelFromXp } from "@/lib/progression";


async function ensureGoldenQuestionHistoryTable(tx: any = prisma) {
  await tx.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "GoldenQuestionHistory" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "level" INTEGER NOT NULL,
      "sessionId" TEXT,
      "questionId" TEXT,
      "awarded" BOOLEAN NOT NULL DEFAULT FALSE,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "GoldenQuestionHistory_user_level_idx" ON "GoldenQuestionHistory"("userId","level")`);
}

async function userAlreadyHadGoldenForLevel(userId: string, level: number) {
  await ensureGoldenQuestionHistoryTable(prisma as any);
  const rows = await (prisma as any).$queryRawUnsafe(`SELECT 1 FROM "GoldenQuestionHistory" WHERE "userId" = $1 AND "level" = $2 LIMIT 1`, userId, level);
  return Array.isArray(rows) && rows.length > 0;
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
    domainId: Array.isArray(q.tags) && q.tags[0] ? String(q.tags[0]).toLowerCase() : undefined,
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
  const placement = await prisma.questionSetPlacement.findFirst({
    where: { lane: "TEST_NOW", isActive: true },
    orderBy: { createdAt: "desc" },
    include: { set: { include: { questions: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } } } },
  });
  if (!placement?.set?.questions?.length) throw new Error("No active Test Now question set found");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { xp: true } }).catch(() => null);
  const currentLevel = levelFromXp(Number(user?.xp || 0));
  const alreadyHadGolden = await userAlreadyHadGoldenForLevel(userId, currentLevel);

  const pool = placement.set.questions.map(mapQuestion);
  const selected = sampleQuestions(pool, questionCount).map((q) => shuffleQuestionPayload(q));
  const goldenPool = pool.filter((q: any) => q.isGoldenEligible);
  let goldenQuestionId: string | null = null;
  let finalQuestions: any[] = [...selected];

  if (!alreadyHadGolden && goldenPool.length > 0 && finalQuestions.length >= 6) {
    const selectedIds = new Set(finalQuestions.map((q: any) => String(q.id || "")));
    const availableGolden = goldenPool.filter((q: any) => !selectedIds.has(String(q.id || "")));
    const weighted = (availableGolden.length ? availableGolden : goldenPool).flatMap((q: any) => Array.from({ length: Math.max(1, Number(q.goldenWeight || 1)) }, () => q));
    const picked = weighted[Math.floor(Math.random() * weighted.length)] || goldenPool[0];
    if (picked) {
      const replacementIndex = Math.min(5, finalQuestions.length - 1);
      finalQuestions[replacementIndex] = { ...shuffleQuestionPayload(picked), isGolden: true, goldenBonusXp: picked.goldenBonusXp || 50 } as any;
      goldenQuestionId = String((finalQuestions[replacementIndex] as any).id);
    }
  }

  const session = await prisma.$transaction(async (tx: any) => {
    await ensureGoldenQuestionHistoryTable(tx);
    const created = await tx.gameSession.create({
      data: {
        userId,
        mode: "TEST_NOW",
        status: "ACTIVE",
        lane: "TEST_NOW",
        placementId: placement.id,
        setId: placement.set.id,
        questionCount: finalQuestions.length,
        goldenSpawned: Boolean(goldenQuestionId),
        currentIndex: 0,
        stateJson: { idx: 0, playerHP: 100, enemyHP: 100, correctCount: 0, xpEarned: 0, tier: 1, mastery: {}, timeLeft: 25, lastWasCorrect: null, feedback: null, locked: false, selected: null, finished: false },
      },
    });
    for (let i = 0; i < finalQuestions.length; i += 1) {
      const q = finalQuestions[i];
      await tx.gameSessionQuestion.create({
        data: {
          sessionId: created.id,
          questionId: String(q.id || "") || null,
          orderIndex: i,
          payloadJson: q,
          isGolden: String(q.id) === goldenQuestionId,
          goldenBonusXp: String(q.id) === goldenQuestionId ? Number(q.goldenBonusXp || 50) : null,
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
      await ensureGoldenQuestionHistoryTable(tx);
      const sessionMeta = await tx.gameSession.findUnique({ where: { id: sessionId }, select: { userId: true } });
      const activeCampaign = await (tx as any).sweepstakesCampaign?.findFirst?.({ where: { status: "ACTIVE", isLive: true, startsAt: { lte: new Date() }, endsAt: { gte: new Date() } }, orderBy: { startsAt: "desc" } }).catch(() => null);
      const metaMap = await getSweepstakesCampaignMetaMap().catch(() => new Map());
      if (answered.length) {
        for (const row of answered) {
          const sessionQuestionId = String(row?.sessionQuestionId || "").trim();
          if (!sessionQuestionId) continue;
          const updatedQuestion = await tx.gameSessionQuestion.update({
            where: { id: sessionQuestionId },
            data: {
              answered: true,
              isCorrect: typeof row?.isCorrect === "boolean" ? row.isCorrect : null,
              selectedAnswer: row?.selectedAnswer === undefined ? undefined : row.selectedAnswer,
              answeredAt: new Date(),
            },
          });
          if (updatedQuestion?.isGolden && row?.isCorrect && activeCampaign && metaMap.get(String(activeCampaign.id))?.allowGoldenQuestion && sessionMeta?.userId) {
            await awardRaffleEntries(tx as any, {
              userId: String(sessionMeta.userId),
              source: "GOLDEN_QUESTION",
              quantity: 1,
              campaignId: activeCampaign.id,
              sourceRefType: "QUESTION",
              sourceRefId: String(updatedQuestion.id),
              auditKey: `golden-question:${String(updatedQuestion.id)}`,
              meta: { sessionId, questionId: updatedQuestion.questionId } as any,
            });
            await tx.$executeRawUnsafe(`UPDATE "GoldenQuestionHistory" SET "awarded" = TRUE WHERE "sessionId" = $1 AND "questionId" = $2`, sessionId, String(updatedQuestion.questionId || ""));
          }
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
    const session = await (prisma as any).gameSession.findUnique({ where: { id: sessionId }, include: { questions: { orderBy: { orderIndex: "asc" } } } });
    return NextResponse.json(serializeSession(session));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to update Test Now session" }, { status: 500 });
  }
}
