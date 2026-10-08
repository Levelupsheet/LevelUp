import { loadLearningContext } from "@/lib/learningHistory";
import { prisma } from "@/lib/prisma";
import { masteryToTargetDifficulty } from "@/lib/learningProfile";
import { normalizeQuestionType } from "@/lib/questionTypes";
import { buildSessionBlueprint, getBankRule, type SessionBlueprintStep } from "@/lib/bankRules";

type RuntimeQuestion = {
  id: string;
  type?: string | null;
  prompt?: string | null;
  domainId?: string | null;
  subdomain?: string | null;
  level?: number | null;
  difficulty?: number | null;
  tags?: string[] | null;
  data?: Record<string, unknown> | null;
};

function normSubdomain(value?: string | null) {
  const raw = String(value || "GENERAL").trim();
  return raw ? raw.toUpperCase() : "GENERAL";
}

function toMillis(value?: string | Date | null) {
  if (!value) return 0;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : 0;
}

function normalizeRuntimeQuestion(input: RuntimeQuestion) {
  const data = input.data && typeof input.data === "object" ? input.data : {};
  const domain = String(input.domainId || (data as any).domainId || (data as any).domain || "GENERAL").trim().toUpperCase();
  const subdomain = normSubdomain(String(input.subdomain || (data as any).subdomain || (data as any).topic || ""));
  const type = String(normalizeQuestionType(input.type) || "multiple_choice").toLowerCase();
  const level = Math.max(1, Math.min(5, Number(input.level ?? input.difficulty ?? 1) || 1));
  const prerequisites = Array.isArray((data as any).prerequisites) ? (data as any).prerequisites.map((v: any) => normSubdomain(String(v))).filter(Boolean) : [];
  const minMastery = Math.max(0, Math.min(100, Number((data as any).minMastery ?? 0) || 0));
  const lifecycleStatus = String((data as any).lifecycleStatus || "ACTIVE").toUpperCase();
  const qualityScore = Math.max(0, Math.min(100, Number((data as any).qualityScore ?? 75) || 75));
  return { ...input, domain, subdomain, type, level, prerequisites, minMastery, lifecycleStatus, qualityScore };
}

export async function getAdaptiveLearningContext(userId?: string | null, options: { scopeKey?: string; questionIds?: string[] } = {}, db: any = prisma) {
  return loadLearningContext(userId, options, db);
}
export async function getMissedQuestionReview(userId?: string | null, options: { scopeKey?: string; questionIds?: string[] } = {}, db: any = prisma) {
  const context = await loadLearningContext(userId, options, db);
  return { questionIds: context.missedQuestionIds, stats: context.missedStats };
}

export function isQuestionUnlocked(question: RuntimeQuestion, learning: Awaited<ReturnType<typeof getAdaptiveLearningContext>>) {
  const q = normalizeRuntimeQuestion(question);
  if (q.lifecycleStatus === "RETIRED" || q.lifecycleStatus === "ARCHIVED") return false;
  const prerequisites = (q as any).prerequisites as string[];
  const minMastery = Number((q as any).minMastery || 0);
  if (!prerequisites.length && minMastery <= 0) return true;
  return prerequisites.every((subdomain) => {
    const key = `${String(q.domain).toLowerCase()}:${String(subdomain).toLowerCase()}`;
    const subMastery = Number(learning.masteryBySubdomain[key] ?? learning.masteryByDomain[String(q.domain).toLowerCase()] ?? 0);
    return subMastery >= minMastery;
  });
}

export function calculateConfidenceScore(input: { correct?: boolean | null; score?: number | null; responseMs?: number | null; hintsUsed?: number | null; attempts?: number | null; }) {
  const partial = Math.max(0, Math.min(1, Number(input.score ?? (input.correct ? 1 : 0))));
  const responseMs = Math.max(0, Number(input.responseMs || 0));
  const hintsUsed = Math.max(0, Number(input.hintsUsed || 0));
  const attempts = Math.max(1, Number(input.attempts || 1));
  let confidence = partial;
  if (partial >= 1 && responseMs > 0 && responseMs <= 12000) confidence += 0.25;
  if (responseMs >= 45000) confidence -= 0.15;
  if (hintsUsed > 0) confidence -= Math.min(0.3, hintsUsed * 0.12);
  if (attempts > 1) confidence -= Math.min(0.2, (attempts - 1) * 0.08);
  return Math.max(0, Math.min(1.5, Number(confidence.toFixed(3))));
}

function calibrationDifficultyOffset(row: any) {
  const drift = Number(row?.difficultyDrift || 0);
  if (drift >= 0.25) return 1;
  if (drift <= -0.25) return -1;
  return 0;
}

export async function getQuestionCalibrationMap(questionIds: string[], db: any = prisma) {
  const ids = Array.from(new Set((questionIds || []).map((v) => String(v || "").trim()).filter(Boolean)));
  if (!ids.length) return new Map<string, any>();
  const rows = await db.gameSessionQuestion.findMany({ where: { questionId: { in: ids }, answered: true } });
  const groups = new Map<string, any[]>();
  for (const row of rows) { const group = groups.get(row.questionId!) || []; group.push(row); groups.set(row.questionId!,group); }
  return new Map([...groups].map(([id,rows]) => [id,{ timesSeen:rows.length,observedAccuracy:rows.filter(q=>q.isCorrect).length / rows.length }]));
}

export function weightedAdaptiveQuestionPlan<T extends RuntimeQuestion>(args: {
  questions: T[];
  questionCount: number;
  learning: Awaited<ReturnType<typeof getAdaptiveLearningContext>>;
  lane?: string | null;
  calibrationMap?: Map<string, any>;
  blueprint?: SessionBlueprintStep[];
  sessionState?: { wrongStreak?: number; inRecovery?: boolean; typeCounts?: Record<string, number> } | null;
}) {
  const questions = (args.questions || []).map(normalizeRuntimeQuestion).filter((q) => isQuestionUnlocked(q as any, args.learning));
  if (!questions.length) return [] as T[];

  const rule = getBankRule(args.lane);
  const blueprint = args.blueprint?.length ? args.blueprint : buildSessionBlueprint(args.questionCount, args.learning.weakestTargetDifficulty);
  const sessionTypeCounts = new Map<string, number>(Object.entries(args.sessionState?.typeCounts || {}));
  const recentTail = args.learning.recentHistory.slice(0, 4);
  const recentWrongCount = recentTail.filter((row) => !row.correct).length;
  const inferredRecovery = Boolean(args.sessionState?.inRecovery) || Number(args.sessionState?.wrongStreak || 0) >= 2 || recentWrongCount >= 2;
  const perDomainCount = new Map<string, number>();
  const selectedIds = new Set<string>();
  const selected: Array<T & { level?: number }> = [];

  for (let stepIndex = 0; stepIndex < blueprint.length && selected.length < args.questionCount; stepIndex += 1) {
    const step = blueprint[stepIndex];
    const remaining = questions.filter((q) => !selectedIds.has(String(q.id)));
    if (!remaining.length) break;
    const nearestDistance = Math.min(...remaining.map(q => Math.abs(q.level - step.difficulty)));
    const candidates = remaining.filter(q => Math.abs(q.level - step.difficulty) === nearestDistance);
    const scored = candidates.map((q, index) => {
      const domainKey = String((q as any).domain).toLowerCase();
      const subKey = `${domainKey}:${String((q as any).subdomain).toLowerCase()}`;
      const typeKey = String((q as any).type).toLowerCase();
      const domainMastery = Number(args.learning.masteryByDomain[domainKey] ?? 50);
      const subMastery = Number(args.learning.masteryBySubdomain[subKey] ?? domainMastery);
      const typeMastery = Number(args.learning.masteryByQuestionType[typeKey] ?? 50);
      const targetDifficultyBase = masteryToTargetDifficulty(Math.round((domainMastery + subMastery) / 2));
      const calibration = args.calibrationMap?.get(String(q.id));
      const targetDifficulty = Math.max(1, Math.min(5, step.difficulty + calibrationDifficultyOffset(calibration))) as 1 | 2 | 3 | 4 | 5;
      const weaknessWeight = ((100 - domainMastery) * 0.55) + ((100 - subMastery) * 0.30) + ((100 - typeMastery) * 0.15);
      const difficultyFit = Math.max(0, 100 - Math.abs(((q as any).level || targetDifficultyBase || 1) - targetDifficulty) * 35);
      const typeTarget = Number(rule.typeTargets[typeKey] ?? 5);
      const sessionTypeCount = Number(sessionTypeCounts.get(typeKey) || 0);
      const typeBalance = Math.max(0, 100 - sessionTypeCount * Math.max(12, 120 / Math.max(5, typeTarget)));
      const novelty = args.learning.recentQuestionIds.has(String(q.id)) ? 0 : 100;
      const recencyPenalty = args.learning.exposureQuestionIds24h.has(String(q.id)) ? 100 : 0;
      const sameWrongDomain = args.learning.lastWrongDomain === domainKey;
      const sameWrongSubdomain = args.learning.lastWrongSubdomain === String((q as any).subdomain).toLowerCase();
      const sameWrongType = args.learning.lastWrongQuestionType === typeKey;
      const remediationBonus =
        (sameWrongDomain ? 55 : 0) +
        (sameWrongSubdomain ? 38 : 0) +
        (sameWrongType ? 14 : 0) +
        (sameWrongDomain && !args.learning.recentQuestionIds.has(String(q.id)) ? 24 : 0);
      const weakBonus = step.weakFocus && domainKey === args.learning.weakestDomain ? 30 : 0;
      const scenarioBonus = step.mode === "scenario" && ["multiple_choice", "cli_command"].includes(typeKey) ? 30 : 0;
      const reviewBonus = step.mode === "review" && ["multiple_choice", "true_false", "cli_command"].includes(typeKey) ? 20 : 0;
      const recoveryMode = inferredRecovery || step.mode === "recovery";
      const recoveryBonus = recoveryMode && ["multiple_choice", "true_false"].includes(typeKey) ? 42 : 0;
      const recoveryDomainBonus = recoveryMode && sameWrongDomain ? 48 : 0;
      const recoveryDifficultyBonus = recoveryMode && Number((q as any).level || 1) <= Math.max(1, args.learning.weakestTargetDifficulty) ? 28 : 0;
      const typePreferenceBonus = step.preferredTypes?.includes(typeKey) ? 18 : 0;
      const qualityBonus = Number((q as any).qualityScore || 70) * 0.08;
      const crowdingPenalty = (perDomainCount.get(domainKey) || 0) * 22;
      const score =
        weaknessWeight * 0.28 +
        difficultyFit * 0.18 +
        typeBalance * 0.14 +
        novelty * 0.12 -
        recencyPenalty * 0.12 +
        remediationBonus * 0.16 +
        weakBonus +
        scenarioBonus +
        reviewBonus +
        recoveryBonus +
        recoveryDomainBonus +
        recoveryDifficultyBonus +
        typePreferenceBonus +
        qualityBonus -
        crowdingPenalty +
        (Math.random() * 3) -
        index * 0.002;

      return { q, score, targetDifficulty };
    }).sort((a, b) => b.score - a.score);

    const picked = scored[0];
    if (!picked) continue;
    selectedIds.add(String(picked.q.id));
    selected.push(picked.q as any);
    const dk = String((picked.q as any).domain).toLowerCase();
    const tk = String((picked.q as any).type).toLowerCase();
    perDomainCount.set(dk, (perDomainCount.get(dk) || 0) + 1);
    sessionTypeCounts.set(tk, (sessionTypeCounts.get(tk) || 0) + 1);
  }

  if (selected.length < Math.min(args.questionCount, questions.length)) {
    for (const q of questions) {
      if (selected.length >= args.questionCount) break;
      if (selectedIds.has(String(q.id))) continue;
      selectedIds.add(String(q.id));
      selected.push(q as any);
    }
  }

  return selected as T[];
}
