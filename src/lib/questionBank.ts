import { prisma } from "@/lib/prisma";
import { buildAdaptiveQuestionPlan, inferDomainFromQuestion, normalizeQuestionDomain } from "@/lib/learningProfile";
import { normalizeDifficultyLevel, shuffleQuestionPayload } from "@/lib/questionTransforms";
import { normalizeQuestionType } from "@/lib/questionTypes";

function stableQuestionSignature(input: { prompt?: string | null; type?: string | null; data?: any; choices?: any; }) {
  const prompt = String(input.prompt || "").trim().toLowerCase().replace(/\s+/g, " ");
  const type = String(input.type || "").trim().toLowerCase();
  const choices = Array.isArray(input.choices) ? input.choices.map((v) => String(v).trim().toLowerCase()) : [];
  const data = input.data && typeof input.data === "object" ? input.data : {};
  const expected = Array.isArray((data as any).expectedCommands) ? (data as any).expectedCommands : Array.isArray((data as any).answers) ? (data as any).answers : Array.isArray((data as any).correctOrder) ? (data as any).correctOrder : [];
  return JSON.stringify({ prompt, type, choices, expected });
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

  const placements = await prisma.questionSetPlacement.findMany({
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

  const deduped: any[] = [];
  const seen = new Set<string>();
  for (const placement of placements) {
    for (const raw of placement?.set?.questions || []) {
      const runtime = mapDbQuestionToRuntime({ ...raw, setName: placement.set.name, setDomain: placement.set.domain });
      const signature = stableQuestionSignature(runtime);
      if (seen.has(signature)) continue;
      seen.add(signature);
      deduped.push(runtime);
    }
  }

  return {
    placements,
    questions: deduped,
    totalQuestionsBeforeDedup: placements.reduce((sum, placement) => sum + (placement?.set?.questions?.length || 0), 0),
  };
}

export async function getLearningContext(userId?: string | null) {
  const safeUserId = String(userId || "").trim();
  if (!safeUserId) return { masteryByDomain: {}, recentHistory: [] as Array<{ questionId: string; correct: boolean }> };

  const [masteries, recent] = await Promise.all([
    prisma.userDomain.findMany({ where: { userId: safeUserId }, select: { domain: true, xp: true } }).catch(() => []),
    (prisma as any).gameSessionQuestion.findMany({
      where: { session: { userId: safeUserId } },
      orderBy: { answeredAt: "desc" },
      take: 120,
      select: { questionId: true, isCorrect: true, payloadJson: true },
    }).catch(() => []),
  ]);

  const masteryByDomain: Record<string, number> = {};
  for (const row of masteries || []) {
    const domainId = normalizeQuestionDomain(String(row.domain || "GENERAL")).toLowerCase();
    const xp = Number((row as any).xp || 0);
    masteryByDomain[domainId] = Math.max(0, Math.min(100, Number(((xp / 8000) * 100).toFixed(1))));
  }

  const recentHistory = (recent || []).map((row: any) => ({
    questionId: String(row?.questionId || row?.payloadJson?.id || "").trim(),
    correct: row?.isCorrect === true,
  })).filter((row: any) => row.questionId);

  return { masteryByDomain, recentHistory };
}

export async function buildQuestionBankSelection(args: {
  lane: string;
  questionCount: number;
  shouldShuffle?: boolean;
  excludeIds?: string[];
  startingPosition?: string | null;
  certExam?: string | null;
  userId?: string | null;
}) {
  const bank = await loadActiveBank({ lane: args.lane, startingPosition: args.startingPosition, certExam: args.certExam });
  const excludeSet = new Set((args.excludeIds || []).map((v) => String(v)));
  const candidatePool = bank.questions.filter((q) => !excludeSet.has(String(q.id)));
  const sourcePool = candidatePool.length >= args.questionCount ? candidatePool : [...candidatePool, ...bank.questions.filter((q) => !candidatePool.some((c) => c.id === q.id))];
  const learning = await getLearningContext(args.userId);
  const planned = buildAdaptiveQuestionPlan({
    questions: sourcePool,
    questionCount: args.questionCount,
    masteryByDomain: learning.masteryByDomain,
    recentHistory: learning.recentHistory,
  });
  const questions = (args.shouldShuffle === false ? planned : planned.map((q) => shuffleQuestionPayload(q))).slice(0, Math.max(0, args.questionCount || 0) || planned.length);

  return {
    ...bank,
    selectedQuestions: questions,
    learning,
  };
}
