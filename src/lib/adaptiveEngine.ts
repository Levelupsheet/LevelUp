import { prisma } from "@/lib/prisma";
import { masteryToTargetDifficulty, normalizeQuestionDomain } from "@/lib/learningProfile";
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
  const domain = normalizeQuestionDomain(String(input.domainId || (data as any).domainId || (data as any).domain || ""));
  const subdomain = normSubdomain(String(input.subdomain || (data as any).subdomain || (data as any).topic || ""));
  const type = String(normalizeQuestionType(input.type) || "multiple_choice").toLowerCase();
  const level = Math.max(1, Math.min(3, Number(input.level ?? input.difficulty ?? 1) || 1));
  const prerequisites = Array.isArray((data as any).prerequisites) ? (data as any).prerequisites.map((v: any) => normSubdomain(String(v))).filter(Boolean) : [];
  const minMastery = Math.max(0, Math.min(100, Number((data as any).minMastery ?? 0) || 0));
  const lifecycleStatus = String((data as any).lifecycleStatus || "ACTIVE").toUpperCase();
  const qualityScore = Math.max(0, Math.min(100, Number((data as any).qualityScore ?? 75) || 75));
  return { ...input, domain, subdomain, type, level, prerequisites, minMastery, lifecycleStatus, qualityScore };
}

export async function ensureAdaptiveLearningTables() {
  try {
    await (prisma as any).$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "UserSkill" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "domain" TEXT NOT NULL,
        "subdomain" TEXT NOT NULL DEFAULT 'GENERAL',
        "questionType" TEXT NOT NULL DEFAULT 'GENERAL',
        "mastery" DOUBLE PRECISION NOT NULL DEFAULT 50,
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "correct" INTEGER NOT NULL DEFAULT 0,
        "avgScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "avgResponseMs" DOUBLE PRECISION,
        "lastSeenAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await (prisma as any).$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UserSkill_user_domain_idx" ON "UserSkill" ("userId","domain")`);
    await (prisma as any).$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UserSkill_user_domain_subdomain_idx" ON "UserSkill" ("userId","domain","subdomain")`);
    await (prisma as any).$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "QuestionExposure" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "questionId" TEXT NOT NULL,
        "domain" TEXT,
        "subdomain" TEXT,
        "questionType" TEXT,
        "score" DOUBLE PRECISION,
        "isCorrect" BOOLEAN,
        "seenAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await (prisma as any).$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "QuestionExposure_user_seen_idx" ON "QuestionExposure" ("userId","seenAt" DESC)`);
    await (prisma as any).$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "QuestionExposure_user_question_idx" ON "QuestionExposure" ("userId","questionId","seenAt" DESC)`);
    await (prisma as any).$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "QuestionCalibration" (
        "questionId" TEXT PRIMARY KEY,
        "timesSeen" INTEGER NOT NULL DEFAULT 0,
        "correctCount" INTEGER NOT NULL DEFAULT 0,
        "observedAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "avgResponseMs" DOUBLE PRECISION,
        "difficultyDrift" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await (prisma as any).$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "QuestionCalibration_updated_idx" ON "QuestionCalibration" ("updatedAt" DESC)`);
  } catch {}
}

export async function getAdaptiveLearningContext(userId?: string | null) {
  const safeUserId = String(userId || "").trim();
  if (!safeUserId) {
    return {
      masteryByDomain: {} as Record<string, number>,
      masteryBySubdomain: {} as Record<string, number>,
      masteryByQuestionType: {} as Record<string, number>,
      recentHistory: [] as Array<{ questionId: string; correct: boolean; score: number; seenAt?: string }>,
      exposureQuestionIds24h: new Set<string>(),
      recentQuestionIds: new Set<string>(),
      lastWrongDomain: null as string | null,
      lastWrongSubdomain: null as string | null,
      lastWrongQuestionType: null as string | null,
      weakestDomain: "general",
      weakestTargetDifficulty: 1 as 1 | 2 | 3,
    };
  }

  await ensureAdaptiveLearningTables();

  const [skillRows, exposureRows, fallbackMasteries, fallbackRecent] = await Promise.all([
    (prisma as any).$queryRawUnsafe(`
      SELECT "domain","subdomain","questionType","mastery","attempts","correct","avgScore","lastSeenAt"
      FROM "UserSkill"
      WHERE "userId" = $1
      ORDER BY "updatedAt" DESC
      LIMIT 1000
    `, safeUserId).catch(() => []),
    (prisma as any).$queryRawUnsafe(`
      SELECT "questionId","domain","subdomain","questionType","isCorrect","score","seenAt"
      FROM "QuestionExposure"
      WHERE "userId" = $1
      ORDER BY "seenAt" DESC
      LIMIT 150
    `, safeUserId).catch(() => []),
    prisma.userDomain.findMany({ where: { userId: safeUserId }, select: { domain: true, xp: true } }).catch(() => []),
    (prisma as any).gameSessionQuestion.findMany({
      where: { session: { userId: safeUserId } },
      orderBy: { answeredAt: "desc" },
      take: 120,
      select: { questionId: true, isCorrect: true, payloadJson: true, answeredAt: true },
    }).catch(() => []),
  ]);

  const masteryByDomain: Record<string, number> = {};
  const masteryBySubdomain: Record<string, number> = {};
  const masteryByQuestionType: Record<string, number> = {};

  for (const row of (skillRows || []) as any[]) {
    const domainKey = String(normalizeQuestionDomain(row?.domain || "GENERAL")).toLowerCase();
    const subKey = `${domainKey}:${normSubdomain(row?.subdomain || "GENERAL").toLowerCase()}`;
    const typeKey = String(normalizeQuestionType(row?.questionType || "multiple_choice")).toLowerCase();
    const mastery = Math.max(0, Math.min(100, Number(row?.mastery || 0)));
    masteryByDomain[domainKey] = masteryByDomain[domainKey] == null ? mastery : Math.min(masteryByDomain[domainKey], mastery);
    masteryBySubdomain[subKey] = masteryBySubdomain[subKey] == null ? mastery : Math.min(masteryBySubdomain[subKey], mastery);
    masteryByQuestionType[typeKey] = masteryByQuestionType[typeKey] == null ? mastery : Math.min(masteryByQuestionType[typeKey], mastery);
  }

  if (!Object.keys(masteryByDomain).length) {
    for (const row of fallbackMasteries || []) {
      const domainId = normalizeQuestionDomain(String((row as any).domain || "GENERAL")).toLowerCase();
      const xp = Number((row as any).xp || 0);
      masteryByDomain[domainId] = Math.max(0, Math.min(100, Number(((xp / 8000) * 100).toFixed(1))));
    }
  }

  const recentHistory: Array<{ questionId: string; correct: boolean; score: number; seenAt?: string }> = [];
  const exposureQuestionIds24h = new Set<string>();
  const recentQuestionIds = new Set<string>();
  let lastWrongDomain: string | null = null;
  let lastWrongSubdomain: string | null = null;
  let lastWrongQuestionType: string | null = null;

  const mergedRows = [
    ...((exposureRows || []) as any[]).map((row) => ({
      questionId: String(row?.questionId || ""),
      correct: row?.isCorrect === true,
      score: Number(row?.score ?? (row?.isCorrect === true ? 1 : 0)),
      seenAt: row?.seenAt ? new Date(row.seenAt).toISOString() : undefined,
      domain: row?.domain,
      subdomain: row?.subdomain,
      questionType: row?.questionType,
    })),
    ...((fallbackRecent || []) as any[]).map((row) => {
      const payload = row?.payloadJson && typeof row.payloadJson === "object" ? row.payloadJson : {};
      return {
        questionId: String(row?.questionId || (payload as any)?.id || ""),
        correct: row?.isCorrect === true,
        score: Number((payload as any)?.partialScore ?? (row?.isCorrect === true ? 1 : 0)),
        seenAt: row?.answeredAt ? new Date(row.answeredAt).toISOString() : undefined,
        domain: (payload as any)?.domainId || (payload as any)?.data?.domainId,
        subdomain: (payload as any)?.subdomain || (payload as any)?.data?.subdomain,
        questionType: (payload as any)?.type,
      };
    }),
  ].filter((row) => row.questionId);

  const now = Date.now();
  for (const row of mergedRows) {
    recentHistory.push({ questionId: row.questionId, correct: row.correct, score: row.score, seenAt: row.seenAt });
    if (recentQuestionIds.size < 20) recentQuestionIds.add(row.questionId);
    if (now - toMillis(row.seenAt) <= 24 * 60 * 60 * 1000) exposureQuestionIds24h.add(row.questionId);
    if (!row.correct && !lastWrongDomain) {
      lastWrongDomain = String(normalizeQuestionDomain(row.domain || "GENERAL")).toLowerCase();
      lastWrongSubdomain = normSubdomain(row.subdomain || "GENERAL").toLowerCase();
      lastWrongQuestionType = String(normalizeQuestionType(row.questionType || "multiple_choice")).toLowerCase();
    }
  }

  const weakestDomainEntry = Object.entries(masteryByDomain).sort((a, b) => a[1] - b[1])[0];
  const weakestDomain = String(weakestDomainEntry?.[0] || lastWrongDomain || "general");
  const weakestTargetDifficulty = masteryToTargetDifficulty(Math.round(Number(weakestDomainEntry?.[1] ?? 35)));

  return {
    masteryByDomain,
    masteryBySubdomain,
    masteryByQuestionType,
    recentHistory,
    exposureQuestionIds24h,
    recentQuestionIds,
    lastWrongDomain,
    lastWrongSubdomain,
    lastWrongQuestionType,
    weakestDomain,
    weakestTargetDifficulty,
  };
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

export async function getQuestionCalibrationMap(questionIds: string[]) {
  const ids = Array.from(new Set((questionIds || []).map((v) => String(v || "").trim()).filter(Boolean)));
  if (!ids.length) return new Map<string, any>();
  await ensureAdaptiveLearningTables();
  const rows = await (prisma as any).$queryRawUnsafe(`SELECT * FROM "QuestionCalibration" WHERE "questionId" = ANY($1)`, ids).catch(() => []);
  return new Map<string, any>((rows || []).map((row: any) => [String(row.questionId), row] as [string, any]));
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
  const perDomainCount = new Map<string, number>();
  const selectedIds = new Set<string>();
  const selected: Array<T & { level?: number }> = [];

  for (let stepIndex = 0; stepIndex < blueprint.length && selected.length < args.questionCount; stepIndex += 1) {
    const step = blueprint[stepIndex];
    const candidates = questions.filter((q) => !selectedIds.has(String(q.id)));
    const scored = candidates.map((q, index) => {
      const domainKey = String((q as any).domain).toLowerCase();
      const subKey = `${domainKey}:${String((q as any).subdomain).toLowerCase()}`;
      const typeKey = String((q as any).type).toLowerCase();
      const domainMastery = Number(args.learning.masteryByDomain[domainKey] ?? 50);
      const subMastery = Number(args.learning.masteryBySubdomain[subKey] ?? domainMastery);
      const typeMastery = Number(args.learning.masteryByQuestionType[typeKey] ?? 50);
      const targetDifficultyBase = masteryToTargetDifficulty(Math.round((domainMastery + subMastery) / 2));
      const calibration = args.calibrationMap?.get(String(q.id));
      const targetDifficulty = Math.max(1, Math.min(3, step.difficulty + calibrationDifficultyOffset(calibration))) as 1 | 2 | 3;
      const weaknessWeight = ((100 - domainMastery) * 0.55) + ((100 - subMastery) * 0.30) + ((100 - typeMastery) * 0.15);
      const difficultyFit = Math.max(0, 100 - Math.abs(((q as any).level || targetDifficultyBase || 1) - targetDifficulty) * 35);
      const typeTarget = Number(rule.typeTargets[typeKey] ?? 5);
      const sessionTypeCount = Number(sessionTypeCounts.get(typeKey) || 0);
      const typeBalance = Math.max(0, 100 - sessionTypeCount * Math.max(12, 120 / Math.max(5, typeTarget)));
      const novelty = args.learning.recentQuestionIds.has(String(q.id)) ? 0 : 100;
      const recencyPenalty = args.learning.exposureQuestionIds24h.has(String(q.id)) ? 100 : 0;
      const remediationBonus =
        (args.learning.lastWrongDomain === domainKey ? 35 : 0) +
        (args.learning.lastWrongSubdomain === String((q as any).subdomain).toLowerCase() ? 20 : 0) +
        (args.learning.lastWrongQuestionType === typeKey ? 12 : 0);
      const weakBonus = step.weakFocus && domainKey === args.learning.weakestDomain ? 30 : 0;
      const scenarioBonus = step.mode === "scenario" && ["incident", "cli_command", "log_analysis"].includes(typeKey) ? 30 : 0;
      const reviewBonus = step.mode === "review" && ["multiple_choice", "fill_blank", "multi_select"].includes(typeKey) ? 20 : 0;
      const recoveryBonus = (args.sessionState?.inRecovery || step.mode === "recovery") && ["multiple_choice", "fill_blank"].includes(typeKey) ? 35 : 0;
      const typePreferenceBonus = step.preferredTypes?.includes(typeKey) ? 18 : 0;
      const qualityBonus = Number((q as any).qualityScore || 70) * 0.08;
      const crowdingPenalty = (perDomainCount.get(domainKey) || 0) * 22;
      const score =
        weaknessWeight * 0.28 +
        difficultyFit * 0.18 +
        typeBalance * 0.14 +
        novelty * 0.12 -
        recencyPenalty * 0.12 +
        remediationBonus * 0.08 +
        weakBonus +
        scenarioBonus +
        reviewBonus +
        recoveryBonus +
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
    selected.push({ ...(picked.q as any), level: picked.targetDifficulty });
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

export async function recordQuestionExposure(input: {
  userId?: string | null;
  questionId?: string | null;
  domain?: string | null;
  subdomain?: string | null;
  questionType?: string | null;
  isCorrect?: boolean | null;
  score?: number | null;
}) {
  const userId = String(input.userId || "").trim();
  const questionId = String(input.questionId || "").trim();
  if (!userId || !questionId) return;
  await ensureAdaptiveLearningTables();
  await (prisma as any).$executeRawUnsafe(
    `INSERT INTO "QuestionExposure" ("id","userId","questionId","domain","subdomain","questionType","score","isCorrect","seenAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP)`,
    `qe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    questionId,
    String(input.domain || "").toUpperCase() || null,
    normSubdomain(input.subdomain || "GENERAL"),
    String(normalizeQuestionType(input.questionType || "multiple_choice")).toUpperCase(),
    input.score == null ? null : Number(input.score),
    typeof input.isCorrect === "boolean" ? input.isCorrect : null,
  ).catch(() => null);
}

export async function upsertQuestionCalibration(input: { questionId?: string | null; isCorrect?: boolean | null; responseMs?: number | null; }) {
  const questionId = String(input.questionId || "").trim();
  if (!questionId) return;
  await ensureAdaptiveLearningTables();
  const rows = await (prisma as any).$queryRawUnsafe(`SELECT * FROM "QuestionCalibration" WHERE "questionId" = $1 LIMIT 1`, questionId).catch(() => []);
  const current = Array.isArray(rows) && rows.length ? rows[0] : null;
  const timesSeen = Number(current?.timesSeen || 0) + 1;
  const correctCount = Number(current?.correctCount || 0) + (input.isCorrect ? 1 : 0);
  const observedAccuracy = Number((correctCount / Math.max(1, timesSeen)).toFixed(4));
  const prevAvg = Number(current?.avgResponseMs || 0);
  const responseMs = input.responseMs == null ? prevAvg || null : Math.max(0, Number(input.responseMs || 0));
  const avgResponseMs = responseMs == null ? null : Number((((prevAvg * Math.max(0, timesSeen - 1)) + responseMs) / timesSeen).toFixed(2));
  const difficultyDrift = Number(((observedAccuracy > 0.85 ? -0.15 : observedAccuracy < 0.40 ? 0.15 : 0) + Number(current?.difficultyDrift || 0) * 0.5).toFixed(3));

  if (current?.questionId) {
    await (prisma as any).$executeRawUnsafe(
      `UPDATE "QuestionCalibration" SET "timesSeen" = $2, "correctCount" = $3, "observedAccuracy" = $4, "avgResponseMs" = $5, "difficultyDrift" = $6, "updatedAt" = CURRENT_TIMESTAMP WHERE "questionId" = $1`,
      questionId, timesSeen, correctCount, observedAccuracy, avgResponseMs, difficultyDrift,
    ).catch(() => null);
  } else {
    await (prisma as any).$executeRawUnsafe(
      `INSERT INTO "QuestionCalibration" ("questionId","timesSeen","correctCount","observedAccuracy","avgResponseMs","difficultyDrift","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)`,
      questionId, timesSeen, correctCount, observedAccuracy, avgResponseMs, difficultyDrift,
    ).catch(() => null);
  }
}

export async function upsertUserSkillFromAnswer(input: {
  userId?: string | null;
  question?: RuntimeQuestion | null;
  score?: number | null;
  isCorrect?: boolean | null;
  responseMs?: number | null;
  hintsUsed?: number | null;
  attempts?: number | null;
}) {
  const userId = String(input.userId || "").trim();
  const question = input.question ? normalizeRuntimeQuestion(input.question) : null;
  if (!userId || !question) return;
  await ensureAdaptiveLearningTables();

  const domain = String((question as any).domain || "GENERAL").toUpperCase();
  const subdomain = normSubdomain((question as any).subdomain || "GENERAL");
  const questionType = String(normalizeQuestionType(question.type || "multiple_choice")).toUpperCase();
  const currentRows = await (prisma as any).$queryRawUnsafe(
    `SELECT "id","mastery","attempts","correct","avgScore","avgResponseMs" FROM "UserSkill"
     WHERE "userId" = $1 AND "domain" = $2 AND "subdomain" = $3 AND "questionType" = $4
     LIMIT 1`,
    userId, domain, subdomain, questionType
  ).catch(() => []);
  const current = Array.isArray(currentRows) && currentRows.length ? currentRows[0] : null;
  const prevMastery = Number(current?.mastery ?? 50);
  const attempts = Number(current?.attempts ?? 0) + 1;
  const correct = Number(current?.correct ?? 0) + (input.isCorrect ? 1 : 0);
  const score = Math.max(0, Math.min(1, Number(input.score ?? (input.isCorrect ? 1 : 0))));
  const difficulty = Math.max(1, Math.min(3, Number((question as any).level || question.difficulty || 1) || 1));
  const confidence = calculateConfidenceScore({ correct: input.isCorrect, score, responseMs: input.responseMs, hintsUsed: input.hintsUsed, attempts: input.attempts });
  const delta = (confidence * (1.35 + difficulty * 0.55)) - ((1 - score) * (0.55 + difficulty * 0.18));
  const nextMastery = Math.max(0, Math.min(100, Number((prevMastery + delta).toFixed(1))));
  const avgScore = Number((((Number(current?.avgScore ?? 0) * Math.max(0, attempts - 1)) + score) / attempts).toFixed(4));
  const responseMs = input.responseMs == null ? null : Math.max(0, Number(input.responseMs || 0));
  const avgResponseMs = responseMs == null
    ? Number(current?.avgResponseMs ?? 0) || null
    : Number((((Number(current?.avgResponseMs ?? 0) * Math.max(0, attempts - 1)) + responseMs) / attempts).toFixed(2));

  if (current?.id) {
    await (prisma as any).$executeRawUnsafe(
      `UPDATE "UserSkill"
       SET "mastery" = $2, "attempts" = $3, "correct" = $4, "avgScore" = $5, "avgResponseMs" = $6, "lastSeenAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1`,
      current.id, nextMastery, attempts, correct, avgScore, avgResponseMs
    ).catch(() => null);
  } else {
    await (prisma as any).$executeRawUnsafe(
      `INSERT INTO "UserSkill" ("id","userId","domain","subdomain","questionType","mastery","attempts","correct","avgScore","avgResponseMs","lastSeenAt","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      `usk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId, domain, subdomain, questionType, nextMastery, attempts, correct, avgScore, avgResponseMs
    ).catch(() => null);
  }
}
