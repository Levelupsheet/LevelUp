"use client";

import type { QuestionData, QuestionType } from "@/lib/questionTypes";
import { GAME_CONFIG } from "@/engine/constants/gameConfig";
import type { EnemyInventory } from "@/engine/systems/EnemyAbilities";

export type DifficultyTier = 1 | 2 | 3 | 4 | 5;

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
  /** Optional difficulty tier for the question (1..5). */
  level?: DifficultyTier;
};

export type CombatRules = {
  /** Starting HP for player/enemy each run */
  startHP: number;
  playerMaxHP?: number;
  enemyMaxHP?: number;

  /** Promotion thresholds based on overall mastery average (0..100). */
  promoteTo2At: number;
  promoteTo3At: number;
  promoteTo4At: number;
  promoteTo5At: number;

  /** Demotion thresholds (hysteresis) */
  demoteTo4Below: number;
  demoteTo3Below: number;
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

  promoteTo2At: 40,
  promoteTo3At: 70,
  promoteTo4At: 85,
  promoteTo5At: 95,

  // add a little hysteresis so tiers don't jitter
  demoteTo4Below: 90,
  demoteTo3Below: 80,
  demoteTo2Below: 65,
  demoteTo1Below: 35,

  masteryGainBase: 4,
  masteryLossWrong: 2,

  playerDamageByTier: GAME_CONFIG.playerDamageByTier,
  enemyDamageByTier: GAME_CONFIG.enemyDamageByTier,

  xpByTier: GAME_CONFIG.xpByTier,

  // "slow -> faster as questions get harder" but still fair
  timePerQuestionByTier: GAME_CONFIG.timerByTier,
};

export type CombatState = {
  playerHP: number;
  enemyHP: number;
  playerMaxHP: number;
  enemyMaxHP: number;
  enemyTier: number;
  enemyInventory: EnemyInventory;

  idx: number;
  selected: number | null;
  locked: boolean;

  correctCount: number;
  xpEarned: number;

  /** Current overall tier (1..5) derived from mastery average */
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
  playerDamage: number;
  enemyDamage: number;
  playerHealing: number;
  usedShield: boolean;
  usedFury: boolean;
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
  if (lvl === 1 || lvl === 2 || lvl === 3 || lvl === 4 || lvl === 5) return lvl;
  return 1;
}

export function computeTierFromMasteryAvg(avg: number, currentTier: DifficultyTier, rules: CombatRules): DifficultyTier {
  const promote = [0, rules.promoteTo2At, rules.promoteTo3At, rules.promoteTo4At, rules.promoteTo5At];
  const demote = [0, rules.demoteTo1Below, rules.demoteTo2Below, rules.demoteTo3Below, rules.demoteTo4Below];
  let tier = currentTier;
  while (tier < 5 && avg >= promote[tier]) tier = (tier + 1) as DifficultyTier;
  while (tier > 1 && avg < demote[tier - 1]) tier = (tier - 1) as DifficultyTier;
  return tier;
}

export function masteryAverage(mastery: Record<string, number>): number {
  const vals = Object.values(mastery);
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function initialCombatState(rules: CombatRules, timed: boolean): CombatState {
  return {
    playerHP: rules.playerMaxHP ?? rules.startHP,
    enemyHP: rules.enemyMaxHP ?? rules.startHP,
    playerMaxHP: rules.playerMaxHP ?? rules.startHP,
    enemyMaxHP: rules.enemyMaxHP ?? rules.startHP,
    enemyTier: 1,
    enemyInventory: { shield: 0, fury: 0, restore: 0, time: 0 },

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
