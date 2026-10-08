import { loadLearningContext } from "@/lib/learningHistory";
import { canonicalTrainingTarget } from "@/lib/contentPools";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureUser } from "@/app/api/_lib/ensureUser";
import { getSessionUser } from "@/lib/auth/session";
import { evaluateQuestionAnswer, normalizeDifficultyLevel, shuffleQuestionPayload } from "@/lib/questionTransforms";
import { normalizeQuestionType } from "@/lib/questionTypes";
import { buildQuestionBankSelection } from "@/lib/questionBank";
import { getSweepstakesCampaignMetaMap } from "@/lib/sweepstakesCampaignMeta";
import { awardGoldenQuestion } from "@/lib/goldenRewards";
import { getOrCreateActiveGoldenSweepstakes } from "@/lib/raffle";
import { buildQuestionExplanation } from "@/lib/explanations";
import { levelFromXp } from "@/lib/progression";
import { applyBossAbilitiesToQuestions, bossCombatRules, bossVisualMeta, buildBossProfile, GOLDEN_BOSS_PROBABILITY } from "@/lib/bossBattle";

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
    setId: q.setId,
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

async function findActiveSession(userId: string, lane = "TEST_NOW") {
  return (prisma as any).gameSession.findFirst({
    where: { userId, lane, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    include: { questions: { orderBy: { orderIndex: "asc" } } },
  });
}

async function buildNewSession(userId: string, questionCount = 15, bankDomain?: string | null, trainingMode = "STANDARD", filters: any = {}, db: any = prisma) {
  const lane = filters.lane || "TEST_NOW";
  const bank = await buildQuestionBankSelection({
    ...filters,
    lane,
    questionCount,
    shouldShuffle: true,
    bankDomain,
    weakDomainTraining: trainingMode === "WEAK_DOMAIN",
    missedQuestionTraining: trainingMode === "MISSED_QUESTIONS",
    userId,
    sessionState: { wrongStreak: 0, inRecovery: false, typeCounts: {} },
  }, db);
  if (!bank.placements.length || !bank.questions.length) throw new Error("No active published question pool found for this selection");
  if (!filters.questionIds && !bank.selectedQuestions.length) throw new Error(trainingMode === "MISSED_QUESTIONS" ? "No missed questions in this bank need review. Try Standard training." : trainingMode === "WEAK_DOMAIN" ? "No active questions in this bank match your weakest domain. Try Mixed or Standard training." : "No eligible questions are available in this bank.");

  const primaryPlacement = bank.placements[0];
  const pool = bank.questions.map(mapQuestion);
  const selected = filters.questionIds
    ? bank.questions.filter((q:any) => filters.questionIds.includes(q.id) && q.difficulty >= 4 && Boolean(q.bossEligible || q.data?.bossEligible)).map(mapQuestion)
    : bank.selectedQuestions.map((q: any) => mapQuestion(q));
  if (filters.questionIds && selected.length !== filters.questionIds.length) throw new Error("Boss questions must belong to the active pool and be hard tier");
  // Golden questions are always hard and use only active study formats.
  const goldenTypes = new Set(["multiple_choice", "true_false", "cli_command"]);
  const goldenPool = pool.filter((q: any) =>
    q.isGoldenEligible &&
    normalizeDifficultyLevel(q.difficulty) >= 4 &&
    goldenTypes.has(normalizeQuestionType(q.type))
  );
  let goldenQuestionId: string | null = null;
  let goldenQuestionIndex: number | null = null;
  let finalQuestions: any[] = [...selected];

  const currentXp = Number(((await db.user.findUnique({ where: { id: userId }, select: { xp: true } }).catch(() => ({ xp: 0 })) as any).xp || 0));
  const currentLevel = levelFromXp(currentXp);
  let boss: any = null;
  if (trainingMode === "BOSS") {
    if (selected.length !== 3) throw new Error("Boss requires three curated hard questions");
    const previous = await db.gameSession.findFirst({ where: { userId, trainingMode: "BOSS", createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } } });
    if (previous) throw new Error("Boss cooldown: wait 15 minutes between encounters");
    const isGolden = Math.random() < GOLDEN_BOSS_PROBABILITY;
    const profile = buildBossProfile({ userXp: currentXp, selectedQuestions: selected, isGolden });
    finalQuestions.sort((a,b) => a.level - b.level);
    finalQuestions = applyBossAbilitiesToQuestions(finalQuestions as any, profile);
    boss = { isGolden, profile, rules: bossCombatRules(profile), visual: bossVisualMeta(isGolden), cooldownMinutes: 15 };
  }
  const alreadyHadGolden = await db.$queryRawUnsafe(`SELECT 1 FROM "GoldenQuestionHistory" WHERE "userId" = $1 AND "level" = $2 AND "awarded" = TRUE LIMIT 1`, userId, currentLevel).then((rows: any[]) => Array.isArray(rows) && rows.length > 0).catch(() => false);

  // Mark an eligible question already selected by the unseen cycle. Never inject
  // a seen/duplicate question or convert an easy question into a Golden challenge.
  if (!filters.questionIds && lane === "TEST_NOW" && !alreadyHadGolden && finalQuestions.length >= 6) {
    const eligibleIds = new Set(goldenPool.map(q => String(q.id)));
    const candidates = finalQuestions.map((q, index) => ({ q, index })).filter(({ q }) => eligibleIds.has(String(q.id)));
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    if (picked) {
      finalQuestions[picked.index] = { ...picked.q, isGolden: true };
      goldenQuestionId = String(picked.q.id);
    }
  }

  finalQuestions.sort((a, b) => a.level - b.level);
  goldenQuestionIndex = finalQuestions.findIndex(q => q.isGolden);
  const save = async (tx: any) => {
    const created = await tx.gameSession.create({
      data: {
        userId,
        mode: lane === "TEST_NOW" ? "TEST_NOW" : "LEARNING",
        status: "ACTIVE",
        lane,
        scopeKey: bank.scopeKey,
        industry: filters.industry || null,
        careerPath: filters.careerPath || null,
        trainingMode,
        learningCycle: bank.exposureCycle.cycle,
        placementId: primaryPlacement.id,
        setId: primaryPlacement.set.id,
        questionCount: finalQuestions.length,
        goldenSpawned: Boolean(goldenQuestionId),
        currentIndex: 0,
        stateJson: { idx:0, wrongStreak:0, inRecovery:false, trainingMode, boss, focusDomain:bank.focusDomain, missedQuestionCount:bank.missedQuestionCount, blueprint:bank.blueprint },
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
  };
  return save(db);
}

export async function GET(req: Request) {
  try {
    const sessionUser = await getSessionUser();
    const userId = String(sessionUser?.id || "").trim();
    if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const lane = new URL(req.url).searchParams.get("lane") || "TEST_NOW";
    if (!["TEST_NOW","TRAINING","CERTIFICATIONS"].includes(lane)) return NextResponse.json({error:"Unsupported learning lane"},{status:400});
    const session = await findActiveSession(userId,lane);
    if (!session) return NextResponse.json({ ok: true, session: null, questions: [] });
    return NextResponse.json({ ...serializeSession(session), learning: { masteryByDomain: (await loadLearningContext(userId, session.scopeKey ? {scopeKey:session.scopeKey} : {})).masteryByDomain } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load Test Now session" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const sessionUser = await getSessionUser();
    const userId = String(sessionUser?.id || "").trim();
    const questionCount = Math.max(1, Math.min(25, Math.floor(Number(body?.questionCount || 15)) || 15));
    const bankDomain = String(body?.bankDomain || "").trim().toUpperCase() || null;
    if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    await ensureUser(userId);
    const lane = String(body.lane || "TEST_NOW").toUpperCase();
    if (!["TEST_NOW","TRAINING","CERTIFICATIONS"].includes(lane)) return NextResponse.json({error:"Unsupported learning lane"},{status:400});
    if (body.trainingMode && !['STANDARD','WEAK_DOMAIN','MISSED_QUESTIONS'].includes(body.trainingMode)) return NextResponse.json({error:'Unsupported training mode'},{status:400});
    const requestedIds = body.encounterType === 'boss' && Array.isArray(body.questionIds) ? [...new Set(body.questionIds.map(String))] : undefined;
    if (requestedIds && requestedIds.length !== 3) return NextResponse.json({error:"Three curated hard boss questions required"},{status:400});
    const filters = { lane, ...canonicalTrainingTarget(body), certExam: body.certExam || null, questionIds: requestedIds };
    await ensureGoldenQuestionHistoryTable();
    const session: any = await prisma.$transaction(async (tx:any) => {
      // Serialize allocation across tabs; selection reads committed earlier sessions.
      await tx.$queryRawUnsafe('SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext($1))', `learning:${userId}`);
      await tx.gameSession.updateMany({ where:{userId,lane,status:"ACTIVE"},data:{status:"ABANDONED",completedAt:new Date()} });
      return buildNewSession(userId,questionCount,bankDomain,requestedIds ? "BOSS" : String(body.trainingMode || "STANDARD"),filters,tx);
    },{timeout:30000});
    return NextResponse.json({ ...serializeSession(session), learning: { masteryByDomain: (await loadLearningContext(userId, session.scopeKey ? {scopeKey:session.scopeKey} : {})).masteryByDomain } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to create learning session" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const sessionId = String(body?.sessionId || "").trim();
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const ownedSession = await prisma.gameSession.findFirst({ where: { id: sessionId, userId: sessionUser.id } });
    if (!ownedSession) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    const currentIndex = Number(body?.currentIndex);
    const state = body?.state && typeof body.state === "object" ? body.state : undefined;
    const status = typeof body?.status === "string" ? String(body.status).toUpperCase() : undefined;
    const answered = Array.isArray(body?.answeredQuestions) ? body.answeredQuestions : [];

    await prisma.$transaction(async (tx: any) => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "GameSession" WHERE "id" = $1 FOR UPDATE',sessionId);
      const latest = await tx.gameSession.findUnique({where:{id:sessionId}});
      if (answered.length) {
        for (const row of answered) {
          const sessionQuestionId = String(row?.sessionQuestionId || "").trim();
          if (!sessionQuestionId) continue;
          const existingQuestion = await tx.gameSessionQuestion.findUnique({ where: { id: sessionQuestionId } });
          if (!existingQuestion || existingQuestion.sessionId !== sessionId) throw new Error("Question does not belong to this session");
          if (existingQuestion.answered) continue;
          if (latest.status !== "ACTIVE") throw new Error("Session is no longer active");
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
                rubric: (evaluation as any)?.feedback ?? null,
                explanationText:
                  typeof explanation === "string"
                    ? explanation
                    : (explanation as any)?.whyCorrect || (explanation as any)?.whyUser || null,
                explanationMeta:
                  explanation && typeof explanation === "object" ? explanation : null,
              },
              answeredAt: new Date(),
            },
          });
        }
      }
      await tx.gameSession.update({
        where: { id: sessionId },
        data: {
          currentIndex: Number.isFinite(currentIndex) ? Math.min(latest.questionCount, Math.max(latest.currentIndex, currentIndex)) : undefined,
          // Preserve server-owned encounter configuration against client progress saves.
          stateJson: state ? { ...(latest.stateJson || {}), ...state, boss: latest.stateJson?.boss || null, trainingMode: latest.trainingMode } : undefined,
          status: status === "COMPLETED" ? "COMPLETED" : status === "ABANDONED" ? "ABANDONED" : undefined,
          completedAt: status === "COMPLETED" ? new Date() : undefined,
        },
      });
    });
    await ensureGoldenQuestionHistoryTable();
    const session = await (prisma as any).gameSession.findUnique({ where: { id: sessionId }, include: { questions: { orderBy: { orderIndex: "asc" } } } });

    // Golden answers are only candidates. Final settlement grants on surviving completion.
    const goldenAwarded = false;
    return NextResponse.json({ ...serializeSession(session), goldenAwarded, learning: { masteryByDomain: (await loadLearningContext(session.userId, session.scopeKey ? {scopeKey:session.scopeKey} : {})).masteryByDomain } });
  } catch (e: any) {
    console.error("PATCH /api/test-now/session failed", e);
    return NextResponse.json(
      {
        error: e?.message || "Failed to update Test Now session",
        stack: process.env.NODE_ENV !== "production" ? e?.stack : undefined,
      },
      { status: /Question does not belong|Session is no longer active/.test(String(e?.message)) ? 400 : 500 }
    );
  }
}
