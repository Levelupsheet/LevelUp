import { GAME_CONFIG } from "@/engine/constants/gameConfig";
import { levelFromXp } from "@/lib/progression";

export function normalizeDifficultyTier(input?: number | null): 1 | 2 | 3 {
  if (input === 3) return 3;
  if (input === 2) return 2;
  return 1;
}

export function calculateQuestionXP(input?: number | null) {
  const tier = normalizeDifficultyTier(input);
  return GAME_CONFIG.xpByTier[tier];
}

export function calculateSpeedBonus(secondsLeft: number) {
  return Math.max(0, Math.floor(secondsLeft / GAME_CONFIG.speedBonusDivisor));
}

export function calculateLevel(totalXp: number) {
  return levelFromXp(totalXp);
}
