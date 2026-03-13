import { normalizeDifficultyLevel, sampleQuestions, shuffleQuestionPayload } from "@/lib/questionTransforms";
import { normalizeQuestionType } from "@/lib/questionTypes";

export const BOSS_SPAWN_PROBABILITY = 0.12;
export const GOLDEN_BOSS_PROBABILITY = 0.07;
export const BOSS_QUESTION_COUNT = 3;
export const BOSS_BONUS_XP = 100;
export const GOLDEN_BOSS_RAFFLE_REWARD = 3;

export type BossAbility = "SHIELD" | "HEAVY_STRIKE" | "DOUBLE_ATTACK" | "DOMAIN_LOCK";

export type BossQuestion = {
  id: string;
  type: string;
  prompt: string;
  choices: string[];
  correctIndex: number | null;
  data: Record<string, unknown>;
  explanation: string | null;
  difficulty: 1 | 2 | 3;
  level: 1 | 2 | 3;
  domainId: string;
  domain: string;
  tags?: string[];
  golden?: boolean;
};

export type BossProfile = {
  maxHP: number;
  shield: number;
  attackPower: number;
  damageModifier: number;
  abilities: BossAbility[];
  targetDomain: string;
  playerLevel: number;
  sessionAccuracy: number;
  difficultyScale: number;
};

export function shouldSpawnBossBattle(randomValue = Math.random()) {
  return randomValue < BOSS_SPAWN_PROBABILITY;
}

export function shouldSpawnGoldenBoss(randomValue = Math.random()) {
  return randomValue < GOLDEN_BOSS_PROBABILITY;
}

export function bossNameForVariant(isGolden: boolean) {
  return isGolden ? "Golden Overlord" : "Shadow Sentinel";
}

export function bossVisualMeta(isGolden: boolean) {
  return {
    bossName: bossNameForVariant(isGolden),
    variant: isGolden ? "golden" : "normal",
    bossLabel: isGolden ? "Golden Boss" : "Boss Battle",
    introTitle: isGolden ? "A GOLDEN BOSS HAS APPEARED" : "BOSS BATTLE INCOMING",
  };
}

function calculateLevel(totalXp: number) {
  if (totalXp >= 2000) return 5;
  if (totalXp >= 1500) return 4;
  if (totalXp >= 1000) return 3;
  if (totalXp >= 500) return 2;
  return 1;
}

function pickRandom<T>(items: T[], count: number) {
  const pool = [...items];
  const out: T[] = [];
  while (pool.length && out.length < count) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function buildBossProfile(args: {
  weakestDomain?: string | null;
  userXp?: number;
  sessionCorrectCount?: number;
  sessionTotalQuestions?: number;
  selectedQuestions?: Array<{ difficulty?: number | null }>;
  isGolden?: boolean;
}) : BossProfile {
  const targetDomain = String(args.weakestDomain || "general").toLowerCase();
  const playerLevel = calculateLevel(Number(args.userXp || 0));
  const sessionTotal = Math.max(1, Number(args.sessionTotalQuestions || 0));
  const sessionAccuracy = clamp(Number(args.sessionCorrectCount || 0) / sessionTotal, 0, 1);
  const avgDifficulty = (args.selectedQuestions || []).length
    ? (args.selectedQuestions || []).reduce((sum, q) => sum + Number(q?.difficulty || 2), 0) / (args.selectedQuestions || []).length
    : 2;

  const difficultyScale = Number((1 + playerLevel * 0.05 + sessionAccuracy * 0.18 + Math.max(0, avgDifficulty - 2) * 0.1 + (args.isGolden ? 0.08 : 0)).toFixed(2));

  const abilities: BossAbility[] = [];
  if (targetDomain !== "general") abilities.push("DOMAIN_LOCK");
  abilities.push("HEAVY_STRIKE");
  if (playerLevel >= 2 || sessionAccuracy >= 0.6) abilities.push("SHIELD");
  if (playerLevel >= 3 || sessionAccuracy >= 0.8) abilities.push("DOUBLE_ATTACK");

  const uniqueAbilities = Array.from(new Set(abilities));
  const attackPower = Math.max(18, Math.round(22 * difficultyScale));
  const maxHP = 3 * Math.max(32, Math.round(34 * difficultyScale));
  const shield = uniqueAbilities.includes("SHIELD") ? 1 : 0;
  const damageModifier = Number((1 + Math.max(0, difficultyScale - 1) * 0.5).toFixed(2));

  return {
    maxHP,
    shield,
    attackPower,
    damageModifier,
    abilities: uniqueAbilities,
    targetDomain,
    playerLevel,
    sessionAccuracy: Number((sessionAccuracy * 100).toFixed(1)),
    difficultyScale,
  };
}

export function mapBossQuestion(q: any, domainId = "general"): BossQuestion {
  const data = q?.data && typeof q.data === "object" ? q.data : {};
  const choices = Array.isArray(q?.choices) ? q.choices : Array.isArray((data as any)?.choices) ? (data as any).choices : [];
  const mapped = {
    id: String(q?.id || `boss_${Math.random().toString(36).slice(2, 8)}`),
    type: normalizeQuestionType(q?.type),
    prompt: String(q?.prompt || "Boss question"),
    choices,
    correctIndex: typeof q?.correctIndex === "number" ? q.correctIndex : typeof (data as any)?.correctIndex === "number" ? (data as any).correctIndex : null,
    data: data as Record<string, unknown>,
    explanation: q?.explanation ?? null,
    difficulty: normalizeDifficultyLevel(q?.difficulty),
    level: normalizeDifficultyLevel(q?.difficulty),
    domainId: String(q?.domainId || domainId || "general").toLowerCase(),
    domain: String(q?.domain || domainId || "GENERAL"),
    tags: Array.isArray(q?.tags) ? q.tags : [],
  };
  return shuffleQuestionPayload(mapped);
}

export function selectBossQuestions(inputQuestions: any[], count = BOSS_QUESTION_COUNT, forcedDomain?: string | null) {
  const sorted = [...inputQuestions].sort((a, b) => Number(b?.difficulty || 1) - Number(a?.difficulty || 1));
  const force = String(forcedDomain || "").toLowerCase();
  const domainSubset = force ? sorted.filter((q) => String(q?.domainId || q?.domain || q?.setDomain || "").toLowerCase().includes(force)) : [];
  const domainHigh = domainSubset.filter((q) => Number(q?.difficulty || 1) >= 2);
  const fallbackHigh = sorted.filter((q) => Number(q?.difficulty || 1) >= 3);
  const source = domainHigh.length >= count ? domainHigh : fallbackHigh.length >= count ? fallbackHigh : (domainSubset.length ? domainSubset : sorted.filter((q) => Number(q?.difficulty || 1) >= 2));
  const finalSource = source.length >= count ? source : sorted;
  return sampleQuestions(finalSource, Math.min(count, finalSource.length));
}

export function applyBossAbilitiesToQuestions(questions: BossQuestion[], profile: BossProfile) {
  const next = questions.map((question) => ({ ...question, data: { ...(question.data || {}) } }));
  if (!next.length) return next;

  if (profile.abilities.includes("SHIELD")) {
    next[0].data = { ...next[0].data, bossAbility: "SHIELD", blockNextCorrect: true, shieldLabel: "Boss shield absorbs the next direct hit." };
  }
  if (profile.abilities.includes("HEAVY_STRIKE") && next[1]) {
    next[1].data = { ...next[1].data, bossAbility: "HEAVY_STRIKE", playerDamageMultiplier: Number((1.1 * profile.damageModifier).toFixed(2)) };
  }
  const doubleAttackIndex = next[2] ? 2 : next[1] ? 1 : 0;
  if (profile.abilities.includes("DOUBLE_ATTACK") && next[doubleAttackIndex]) {
    next[doubleAttackIndex].data = { ...next[doubleAttackIndex].data, bossAbility: "DOUBLE_ATTACK", playerDamageMultiplier: Number((2 * profile.damageModifier).toFixed(2)) };
  }
  if (profile.abilities.includes("DOMAIN_LOCK")) {
    next.forEach((question) => {
      question.data = { ...question.data, domainLock: profile.targetDomain, bossTargetDomain: profile.targetDomain };
    });
  }

  return next;
}

export function bossCombatRules(profile?: BossProfile | null) {
  const scale = Number(profile?.difficultyScale || 1);
  const startHP = Math.max(102, Number(profile?.maxHP || 120));
  const baseEnemyDamage = Math.max(34, Math.round(34 * scale));
  const basePlayerDamage = Math.max(18, Math.round((profile?.attackPower || 22) * 0.9));
  return {
    startHP,
    enemyDamageByTier: { 1: baseEnemyDamage, 2: baseEnemyDamage, 3: baseEnemyDamage },
    playerDamageByTier: {
      1: basePlayerDamage,
      2: Math.max(basePlayerDamage + 4, Math.round(basePlayerDamage * 1.1)),
      3: Math.max(basePlayerDamage + 8, Math.round(basePlayerDamage * 1.25)),
    },
    xpByTier: {
      1: Math.round(20 * scale),
      2: Math.round(30 * scale),
      3: Math.round(45 * scale),
    },
    timePerQuestionByTier: { 1: 35, 2: 30, 3: 25 },
  } as const;
}

export function bossAbilityLabel(ability: BossAbility) {
  if (ability === "SHIELD") return "Shield";
  if (ability === "HEAVY_STRIKE") return "Heavy Strike";
  if (ability === "DOUBLE_ATTACK") return "Double Attack";
  if (ability === "DOMAIN_LOCK") return "Domain Lock";
  return ability;
}
