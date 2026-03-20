import type { ContentLane, QuestionDomain, QuestionType } from "@prisma/client";

export const QUESTION_DOMAINS = [
  "IDENTITY",
  "NETWORKING",
  "SECURITY",
  "COMPUTE",
  "STORAGE",
  "AZURE",
  "AWS",
  "WINDOWS",
  "GENERAL",
] as const;

export type SupportedQuestionDomain = (typeof QUESTION_DOMAINS)[number];

export type LearningAnswerEvent = {
  questionId: string;
  prompt: string;
  type?: string | null;
  domainId?: string | null;
  difficulty?: number | null;
  correct: boolean;
  answeredAt?: string | null;
};

export function normalizeQuestionDomain(value?: string | null): SupportedQuestionDomain {
  const raw = String(value || "GENERAL").trim().toUpperCase();
  return (QUESTION_DOMAINS as readonly string[]).includes(raw) ? (raw as SupportedQuestionDomain) : "GENERAL";
}

export function domainEnumToId(value?: QuestionDomain | string | null): string {
  return normalizeQuestionDomain(String(value || "GENERAL")).toLowerCase();
}

export function domainIdToEnum(value?: string | null): SupportedQuestionDomain {
  return normalizeQuestionDomain(value);
}

export function domainLabel(value?: string | null): string {
  const domain = normalizeQuestionDomain(value);
  return domain.charAt(0) + domain.slice(1).toLowerCase();
}

export function inferDomainFromQuestion(input: {
  tags?: string[] | null;
  prompt?: string | null;
  data?: Record<string, unknown> | null;
  domain?: string | null;
  setDomain?: string | null;
}) {
  const explicit = normalizeQuestionDomain(input.domain || input.setDomain || String(input.data?.domainId || ""));
  if (explicit !== "GENERAL") return explicit;

  const tags = Array.isArray(input.tags) ? input.tags.map((tag) => String(tag).trim().toUpperCase()) : [];
  for (const tag of tags) {
    if ((QUESTION_DOMAINS as readonly string[]).includes(tag)) return tag as SupportedQuestionDomain;
    if (tag.includes("IDENT")) return "IDENTITY";
    if (tag.includes("NETWORK")) return "NETWORKING";
    if (tag.includes("SECUR")) return "SECURITY";
    if (tag.includes("COMPUT")) return "COMPUTE";
    if (tag.includes("STOR")) return "STORAGE";
    if (tag.includes("AZURE") || tag.includes("M365") || tag.includes("ENTRA")) return "AZURE";
    if (tag === "AWS" || tag.includes("VPC") || tag.includes("IAM") || tag.includes("EC2") || tag.includes("S3")) return "AWS";
    if (tag.includes("WINDOWS") || tag.includes("BITLOCKER") || tag.includes("AD")) return "WINDOWS";
  }

  const prompt = String(input.prompt || "").toLowerCase();
  if (/identity|entra|azure ad|mfa|conditional access|pim/.test(prompt)) return "IDENTITY";
  if (/dns|dhcp|subnet|gateway|network|https|port|routing|switch/.test(prompt)) return "NETWORKING";
  if (/security|phishing|malware|incident|iam|policy|least privilege|defender/.test(prompt)) return "SECURITY";
  if (/compute|vm|ec2|instance|lambda|container|kubernetes/.test(prompt)) return "COMPUTE";
  if (/storage|disk|s3|blob|file share|efs|ebs/.test(prompt)) return "STORAGE";
  if (/azure|entra|intune|microsoft 365|az-900/.test(prompt)) return "AZURE";
  if (/aws|ec2|s3|iam|vpc|rds/.test(prompt)) return "AWS";
  if (/windows|bitlocker|gpo|registry|powershell|active directory/.test(prompt)) return "WINDOWS";
  return "GENERAL";
}

export function masteryToTargetDifficulty(mastery: number): 1 | 2 | 3 {
  if (mastery >= 70) return 3;
  if (mastery >= 40) return 2;
  return 1;
}

export function computeAccuracy(correctCount: number, wrongCount: number): number {
  const total = correctCount + wrongCount;
  if (!total) return 0;
  return Number(((correctCount / total) * 100).toFixed(1));
}

export function nextMasteryValue(current: number, correct: boolean, difficulty: number) {
  const safeCurrent = Number.isFinite(current) ? current : 50;
  const safeDifficulty = Math.max(1, Math.min(5, Math.round(Number(difficulty) || 1)));
  const gain = 0.8 + safeDifficulty * 0.45;
  const loss = 0.4 + safeDifficulty * 0.3;
  return Math.max(0, Math.min(100, Number((safeCurrent + (correct ? gain : -loss)).toFixed(1))));
}

export function summarizeWeakestDomains(rows: Array<{ domain: string; mastery: number }>) {
  return [...rows]
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 3)
    .map((row) => normalizeQuestionDomain(row.domain));
}

export function buildAdaptiveQuestionPlan<T extends { id: string; domainId?: string | null; level?: number | null }>(args: {
  questions: T[];
  questionCount: number;
  masteryByDomain?: Record<string, number>;
  recentHistory?: Array<{ questionId: string; correct: boolean }>;
}) {
  const masteryByDomain = args.masteryByDomain || {};
  const recency = new Map<string, { correct: boolean; seen: number }>();
  for (const item of args.recentHistory || []) {
    const prev = recency.get(item.questionId);
    recency.set(item.questionId, { correct: item.correct, seen: (prev?.seen || 0) + 1 });
  }

  const scored = args.questions.map((question, index) => {
    const domain = domainEnumToId(question.domainId || "general");
    const mastery = Number(masteryByDomain[domain] ?? 0);
    const targetDifficulty = masteryToTargetDifficulty(mastery);
    const level = Math.max(1, Math.min(3, Number(question.level || 1))) as 1 | 2 | 3;
    const recent = recency.get(question.id);
    const recentPenalty = recent ? (recent.correct ? 28 + recent.seen * 6 : 10 + recent.seen * 4) : 0;
    const weaknessBonus = (100 - mastery) * 0.8;
    const difficultyPenalty = Math.abs(level - targetDifficulty) * 14;
    const randomness = Math.random() * 8;
    const score = weaknessBonus - difficultyPenalty - recentPenalty + randomness - index * 0.002;
    return { question, score, domain, mastery, targetDifficulty };
  });

  scored.sort((a, b) => b.score - a.score);
  const selected: T[] = [];
  const perDomainCount = new Map<string, number>();

  for (const item of scored) {
    if (selected.length >= args.questionCount) break;
    const currentDomainCount = perDomainCount.get(item.domain) || 0;
    const quota = item.domain === "general" ? 2 : 3;
    if (currentDomainCount >= quota && selected.length + 2 < args.questionCount) continue;
    selected.push({
      ...item.question,
      level: item.targetDifficulty,
    });
    perDomainCount.set(item.domain, currentDomainCount + 1);
  }

  if (selected.length < Math.min(args.questionCount, args.questions.length)) {
    for (const item of scored) {
      if (selected.length >= args.questionCount) break;
      if (!selected.find((q) => q.id === item.question.id)) selected.push(item.question);
    }
  }

  return selected;
}

export type LearningProfileSnapshot = {
  overallMastery: number;
  weakestDomains: SupportedQuestionDomain[];
  masteryByDomain: Array<{ domain: SupportedQuestionDomain; mastery: number; correctCount: number; wrongCount: number; accuracy: number; currentDifficulty: number }>;
  accuracyByDifficulty: Array<{ domain: SupportedQuestionDomain; difficulty: number; correctCount: number; wrongCount: number; accuracy: number }>;
  recentHistory: Array<{ questionId: string; prompt: string; domain: SupportedQuestionDomain; difficulty: number; correct: boolean; answeredAt: string }>;
};
