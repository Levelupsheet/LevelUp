"use client";

import type { QuestionData, QuestionType } from "@/lib/questionTypes";

export type DifficultyTier = 1 | 2 | 3;

export type CombatQuestion = {
  id: string;
  prompt: string;
  type?: QuestionType;
  choices?: string[];
  correctIndex?: number | null;
  data?: QuestionData | null;
  explanation?: string | null;
  /** Optional domain id used for mastery tracking (e.g. "identity", "networking") */
  domainId?: string;
  /** Optional difficulty tier for the question (1..3). */
  level?: DifficultyTier;
};

export type CombatRules = {
  /** Starting HP for player/enemy each run */
  startHP: number;

  /** Promotion thresholds based on overall mastery average (0..100). */
  promoteTo2At: number;
  promoteTo3At: number;

  /** Demotion thresholds (hysteresis) */
  demoteTo2Below: number;
  demoteTo1Below: number;

  /** Mastery deltas */
  masteryGainBase: number;     // per correct at level 1
  masteryLossWrong: number;    // per wrong

  /** Damage values by tier */
  playerDamageByTier: Record<DifficultyTier, number>;
  enemyDamageByTier: Record<DifficultyTier, number>;

  /** XP by tier (base per correct) */
  xpByTier: Record<DifficultyTier, number>;

  /** Timers (seconds) by tier (per question). Only used for timed modes. */
  timePerQuestionByTier: Record<DifficultyTier, number>;
};

export const DEFAULT_RULES: CombatRules = {
  startHP: 100,

  promoteTo2At: 70,
  promoteTo3At: 85,

  // add a little hysteresis so tiers don't jitter
  demoteTo2Below: 80,
  demoteTo1Below: 65,

  masteryGainBase: 4,
  masteryLossWrong: 2,

  playerDamageByTier: { 1: 10, 2: 15, 3: 20 },
  enemyDamageByTier: { 1: 12, 2: 18, 3: 25 },

  xpByTier: { 1: 15, 2: 25, 3: 40 },

  // "slow -> faster as questions get harder" but still fair
  timePerQuestionByTier: { 1: 25, 2: 18, 3: 12 },
};

export type CombatState = {
  playerHP: number;
  enemyHP: number;

  idx: number;
  selected: number | null;
  locked: boolean;

  correctCount: number;
  xpEarned: number;

  /** Current overall tier (1..3) derived from mastery average */
  tier: DifficultyTier;

  /** domain mastery values (0..100) */
  mastery: Record<string, number>;

  /** For timed modes */
  timeLeft: number; // seconds for current question (0 when not timed)

  /** UI feedback */
  lastWasCorrect: boolean | null;
  feedback: string | null;

  finished: boolean;
};

export type SubmitResult = {
  correct: boolean;
  playerHP: number;
  enemyHP: number;
  xpDelta: number;
  tier: DifficultyTier;
  domainId: string;
  masteryValue: number;
};

export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function inferDomainId(q: CombatQuestion): string {
  const d = (q.domainId || "").trim();
  if (d) return d.toLowerCase();
  // lightweight fallback: look for common words in prompt
  const p = (q.prompt || "").toLowerCase();
  if (p.includes("mfa") || p.includes("entra") || p.includes("pim") || p.includes("identity")) return "identity";
  if (p.includes("dns") || p.includes("dhcp") || p.includes("ip ") || p.includes("gateway") || p.includes("network")) return "networking";
  if (p.includes("iam") || p.includes("role") || p.includes("policy")) return "security";
  if (p.includes("windows") || p.includes("driver") || p.includes("bitlocker")) return "windows";
  return "general";
}

export function inferLevel(q: CombatQuestion): DifficultyTier {
  const lvl = q.level;
  if (lvl === 1 || lvl === 2 || lvl === 3) return lvl;
  return 1;
}

export function computeTierFromMasteryAvg(avg: number, currentTier: DifficultyTier, rules: CombatRules): DifficultyTier {
  // Promote
  if (avg >= rules.promoteTo3At) return 3;
  if (avg >= rules.promoteTo2At) return 2;

  // Demote with hysteresis
  if (currentTier === 3 && avg < rules.demoteTo2Below) return 2;
  if (currentTier === 2 && avg < rules.demoteTo1Below) return 1;

  return 1;
}

export function masteryAverage(mastery: Record<string, number>): number {
  const vals = Object.values(mastery);
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function initialCombatState(rules: CombatRules, timed: boolean): CombatState {
  return {
    playerHP: rules.startHP,
    enemyHP: rules.startHP,

    idx: 0,
    selected: null,
    locked: false,

    correctCount: 0,
    xpEarned: 0,

    tier: 1,
    mastery: {},

    timeLeft: timed ? rules.timePerQuestionByTier[1] : 0,

    lastWasCorrect: null,
    feedback: null,

    finished: false,
  };
}
