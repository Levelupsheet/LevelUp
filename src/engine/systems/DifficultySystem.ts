import { normalizeDifficultyTier } from "./XPSystem";
import { computeTierFromMasteryAvg as computeCombatTier, DEFAULT_RULES, type DifficultyTier } from "../CombatQuizEngine";
export const inferTierFromDifficulty = normalizeDifficultyTier;
export function computeTierFromMasteryAvg(avg: number, currentTier: DifficultyTier): DifficultyTier {
  return computeCombatTier(avg, currentTier, DEFAULT_RULES);
}
