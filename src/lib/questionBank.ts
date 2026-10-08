import { cycleCandidates, learningScope } from "@/lib/learningEngine";
import { learnerEligible } from "@/lib/contentPipeline";
import { trainingPlacementFilter } from "@/lib/contentPools";
import { prisma } from "@/lib/prisma";
import { inferDomainFromQuestion } from "@/lib/learningProfile";
import { getAdaptiveLearningContext, getQuestionCalibrationMap, weightedAdaptiveQuestionPlan, isQuestionUnlocked } from "@/lib/adaptiveEngine";
import { buildSessionBlueprint } from "@/lib/bankRules";
import { normalizeDifficultyLevel, shuffleQuestionPayload } from "@/lib/questionTransforms";
import { normalizeQuestionType } from "@/lib/questionTypes";
import { clusterQuestionsBySimilarity, promptSignature } from "@/lib/questionQuality";

function stableQuestionSignature(input: { prompt?: string | null; type?: string | null; data?: any; choices?: any; subdomain?: string | null }) {
  return promptSignature(input);
}



function isMissingSubdomainColumnError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("mcqquestion.subdomain") && message.includes("does not exist");
}

async function loadPlacementsWithQuestions(where: any, db: any = prisma) {
  try {
    return await db.questionSetPlacement.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      include: {
        set: {
          include: {
            questions: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
          },
        },
      },
    });
  } catch (e: any) {
    if (!isMissingSubdomainColumnError(e)) throw e;
    const placements = await db.questionSetPlacement.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      include: { set: true },
    });
    const setIds = Array.from(new Set(placements.map((p: any) => String(p?.setId || "")).filter(Boolean)));
    const questionsBySet = new Map<string, any[]>();
    for (const setId of setIds) {
      const rows = await db.$queryRawUnsafe(
        `SELECT "id", "setId", "prompt", "type", "data", "choices", "correctIndex", "sortOrder", "explanation", "difficulty", "tags", "testNowEligible", "isGoldenEligible", "goldenWeight", "goldenBonusXp", "createdAt", "updatedAt" FROM "MCQQuestion" WHERE "setId" = $1 ORDER BY "sortOrder" ASC, "createdAt" ASC`,
        setId,
      );
      questionsBySet.set(String(setId), Array.isArray(rows) ? rows : []);
    }
    return placements.map((placement: any) => ({
      ...placement,
      set: {
        ...placement.set,
        questions: questionsBySet.get(String(placement.setId)) || [],
      },
    }));
  }
}

export function mapDbQuestionToRuntime(q: any) {
  const type = normalizeQuestionType(q.type);
  const rawData = q.data && typeof q.data === "object" ? q.data : {};
  const choices = Array.isArray(q.choices) ? (q.choices as string[]) : Array.isArray((rawData as any).choices) ? (rawData as any).choices : [];
  const correctIndex = typeof q.correctIndex === "number" ? q.correctIndex : typeof (rawData as any).correctIndex === "number" ? (rawData as any).correctIndex : null;
  const domain = inferDomainFromQuestion({
    domain: q?.domainId || (rawData as any)?.domainId || (rawData as any)?.domain || null,
    setDomain: q?.setDomain || null,
    prompt: q.prompt,
    tags: Array.isArray(q.tags) ? q.tags : [],
    data: rawData,
  });

  return {
    id: q.id,
    type,
    prompt: q.prompt,
    choices,
    correctIndex,
    data: { ...rawData, domainId: String((rawData as any)?.domainId || domain.toLowerCase()) },
    explanation: q.explanation,
    difficulty: normalizeDifficultyLevel(q.difficulty),
    level: normalizeDifficultyLevel(q.difficulty),
    tags: Array.isArray(q.tags) ? q.tags : [],
    sortOrder: Number(q.sortOrder || 0),
    domainId: String(rawData.domainId || domain).toLowerCase(),
    subdomain: String((q as any).subdomain || (rawData as any)?.subdomain || (rawData as any)?.topic || "GENERAL").toLowerCase(),
    setId: q.setId,
    setName: q.setName,
    setDomain: q.setDomain,
    createdAt: q.createdAt,
    isGoldenEligible: Boolean(q.isGoldenEligible),
    goldenWeight: Number(q.goldenWeight || 1),
    goldenBonusXp: Number(q.goldenBonusXp || 50),
  };
}

export async function loadActiveBank(args: {
  lane: string;
  startingPosition?: string | null;
  industry?: string | null;
  careerPath?: string | null;
  certExam?: string | null;
  bankDomain?: string | null;
}, db: any = prisma) {
  const where: any = { lane: String(args.lane || "").toUpperCase(), isActive: true, set: { status: "PUBLISHED" } };
  const bankDomain = String(args.bankDomain || "").trim().toUpperCase();
  if (bankDomain && bankDomain !== "MIXED") where.set = { status: "PUBLISHED", domain: bankDomain };
  if (where.lane === "TRAINING") {
    Object.assign(where, trainingPlacementFilter(args));
  }
  if (where.lane === "CERTIFICATIONS") where.certExam = args.certExam || null;

  const placements = await loadPlacementsWithQuestions(where, db);

  const deduped: any[] = [];
  const seen = new Set<string>();
  for (const placement of placements) {
    for (const raw of placement?.set?.questions || []) {
      const runtime = mapDbQuestionToRuntime({ ...raw, setName: placement.set.name, setDomain: placement.set.domain });

      if (!learnerEligible(raw)) continue;
      const signature = stableQuestionSignature(runtime);
      if (seen.has(signature)) continue;
      seen.add(signature);
      deduped.push(runtime);
    }
  }

  const clusters = clusterQuestionsBySimilarity(deduped, 0.9);
  const filtered = deduped;

  return {
    placements,
    questions: filtered,
    similarClusters: clusters.filter((c) => c.ids.length > 1),
    totalQuestionsBeforeDedup: placements.reduce((sum, placement) => sum + (placement?.set?.questions?.length || 0), 0),
  };
}

export async function getLearningContext(userId?: string | null) {
  return getAdaptiveLearningContext(userId);
}


async function getUnseenCyclePool(userId: string | null | undefined, scopeKey: string, questions: any[], trainingMode: string, db: any = prisma) {
  if (!userId || !questions.length) return cycleCandidates(questions, new Map());
  const scope = { userId, OR: [{scopeKey}, {scopeKey:null, lane:JSON.parse(scopeKey)[0]}], trainingMode };
  const latest = await db.gameSession.findFirst({ where:scope,orderBy:{learningCycle:'desc'},select:{learningCycle:true} });
  const currentCycle = latest?.learningCycle || 1;
  const rows = await db.gameSessionQuestion.groupBy({ by: ['questionId'], where: { questionId: { in: questions.map(q => q.id) }, session: { ...scope,learningCycle:currentCycle } }, _count: { questionId: true } });
  return cycleCandidates(questions,new Map(rows.map((q:any) => [q.questionId!, q._count.questionId])),currentCycle);
}

export async function buildQuestionBankSelection(args: {
  lane: string;
  questionCount: number;
  shouldShuffle?: boolean;
  excludeIds?: string[];
  startingPosition?: string | null;
  industry?: string | null;
  careerPath?: string | null;
  certExam?: string | null;
  bankDomain?: string | null;
  userId?: string | null;
  sessionState?: { wrongStreak?: number; inRecovery?: boolean; typeCounts?: Record<string, number> } | null;
  weakDomainTraining?: boolean;
  missedQuestionTraining?: boolean;
}, db: any = prisma) {
  const bank = await loadActiveBank({ lane: args.lane, startingPosition: args.startingPosition, industry: args.industry, careerPath: args.careerPath, certExam: args.certExam, bankDomain: args.bankDomain }, db);
  const excludeSet = new Set((args.excludeIds || []).map((v) => String(v)));
  // For now the live study game supports the three formats that provide the
  // cleanest quiz/combat experience. Legacy formats stay in the DB/admin but
  // are not selected into new sessions.
  const activeTypes = new Set(["multiple_choice", "true_false", "cli_command"]);
  const candidatePool = bank.questions.filter((q) =>
    !excludeSet.has(String(q.id)) && activeTypes.has(normalizeQuestionType(q.type))
  );
  const scopeKey = learningScope(args);
  const options = { scopeKey, questionIds: candidatePool.map(q => q.id) };
  const learning = await getAdaptiveLearningContext(args.userId, options, db);
  const unlockedPool = candidatePool.filter(q => isQuestionUnlocked(q, learning));
  const trainingMode = args.missedQuestionTraining ? 'MISSED_QUESTIONS' : args.weakDomainTraining ? 'WEAK_DOMAIN' : 'STANDARD';
  const missedReview = args.missedQuestionTraining ? { questionIds: learning.missedQuestionIds } : null;
  // Weak Domain Training deliberately narrows Test Now to the learner's weakest
  // measured domain. Unlike the normal unseen cycle, remediation may revisit
  // previously seen questions because repeated practice is the point of this mode.
  const weakDomain = String(learning.weakestDomain || "").toLowerCase();
  const weakPool = args.weakDomainTraining
    ? unlockedPool.filter((q) => String(q.domainId || "general").toLowerCase() === weakDomain)
    : [];
  const missedPool = args.missedQuestionTraining && missedReview
    ? unlockedPool.filter((q) => missedReview.questionIds.has(String(q.id)))
    : [];
  const applicablePool = args.missedQuestionTraining
    ? missedPool
    : args.weakDomainTraining
      ? weakPool
      : unlockedPool;
  const cycle = await getUnseenCyclePool(args.userId, scopeKey, applicablePool, trainingMode, db);
  const sourcePool = cycle.questions;
  const calibrationMap = await getQuestionCalibrationMap(sourcePool.map((q) => String(q.id)), db);
  const blueprint = buildSessionBlueprint(args.questionCount, learning.weakestTargetDifficulty);
  const planned = weightedAdaptiveQuestionPlan({
    questions: sourcePool,
    questionCount: args.questionCount,
    learning,
    lane: args.lane,
    calibrationMap,
    blueprint,
    sessionState: args.sessionState,
  });
  const questions = (args.shouldShuffle === false ? planned : planned.map((q) => shuffleQuestionPayload(q))).slice(0, Math.max(0, args.questionCount || 0) || planned.length);

  return {
    ...bank,
    selectedQuestions: questions,
    learning,
    scopeKey,
    blueprint,
    calibrationMap,
    exposureCycle: { cycle: cycle.cycle, reset: cycle.cycleReset, previouslySeen: cycle.seenCount, availableUnseen: cycle.questions.length, bankSize: candidatePool.length },
    trainingMode: args.missedQuestionTraining ? "MISSED_QUESTIONS" : args.weakDomainTraining ? "WEAK_DOMAIN" : "STANDARD",
    focusDomain: args.weakDomainTraining ? weakDomain : null,
    missedQuestionCount: missedPool.length,
  };
}
