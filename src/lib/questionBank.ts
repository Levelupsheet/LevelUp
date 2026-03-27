import { prisma } from "@/lib/prisma";
import { inferDomainFromQuestion } from "@/lib/learningProfile";
import { getAdaptiveLearningContext, getQuestionCalibrationMap, weightedAdaptiveQuestionPlan } from "@/lib/adaptiveEngine";
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

async function loadPlacementsWithQuestions(where: any) {
  try {
    return await prisma.questionSetPlacement.findMany({
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
    const placements = await prisma.questionSetPlacement.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      include: { set: true },
    });
    const setIds = Array.from(new Set(placements.map((p: any) => String(p?.setId || "")).filter(Boolean)));
    const questionsBySet = new Map<string, any[]>();
    for (const setId of setIds) {
      const rows = await prisma.$queryRawUnsafe(
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
    domainId: domain.toLowerCase(),
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
  certExam?: string | null;
}) {
  const where: any = { lane: String(args.lane || "").toUpperCase(), isActive: true };
  if (where.lane === "TRAINING") where.startingPosition = args.startingPosition || null;
  if (where.lane === "CERTIFICATIONS") where.certExam = args.certExam || null;

  const placements = await loadPlacementsWithQuestions(where);

  const deduped: any[] = [];
  const seen = new Set<string>();
  for (const placement of placements) {
    for (const raw of placement?.set?.questions || []) {
      const runtime = mapDbQuestionToRuntime({ ...raw, setName: placement.set.name, setDomain: placement.set.domain });
      const lifecycleStatus = String((runtime.data as any)?.lifecycleStatus || "ACTIVE").toUpperCase();
      if (["RETIRED", "ARCHIVED"].includes(lifecycleStatus)) continue;
      const signature = stableQuestionSignature(runtime);
      if (seen.has(signature)) continue;
      seen.add(signature);
      deduped.push(runtime);
    }
  }

  const clusters = clusterQuestionsBySimilarity(deduped, 0.9);
  const clusteredOut = new Set<string>();
  for (const cluster of clusters) {
    for (const id of cluster.ids.slice(1)) clusteredOut.add(String(id));
  }
  const filtered = deduped.filter((q) => !clusteredOut.has(String(q.id)));

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

export async function buildQuestionBankSelection(args: {
  lane: string;
  questionCount: number;
  shouldShuffle?: boolean;
  excludeIds?: string[];
  startingPosition?: string | null;
  certExam?: string | null;
  userId?: string | null;
  sessionState?: { wrongStreak?: number; inRecovery?: boolean; typeCounts?: Record<string, number> } | null;
}) {
  const bank = await loadActiveBank({ lane: args.lane, startingPosition: args.startingPosition, certExam: args.certExam });
  const excludeSet = new Set((args.excludeIds || []).map((v) => String(v)));
  const candidatePool = bank.questions.filter((q) => !excludeSet.has(String(q.id)));
  const sourcePool = candidatePool.length >= args.questionCount ? candidatePool : [...candidatePool, ...bank.questions.filter((q) => !candidatePool.some((c) => c.id === q.id))];
  const learning = await getLearningContext(args.userId);
  const calibrationMap = await getQuestionCalibrationMap(sourcePool.map((q) => String(q.id)));
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
    blueprint,
    calibrationMap,
  };
}
