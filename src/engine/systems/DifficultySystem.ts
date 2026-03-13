import { GAME_CONFIG } from "@/engine/constants/gameConfig";
export function inferTierFromDifficulty(input?: number | null): 1 | 2 | 3 { if (input === 3) return 3; if (input === 2) return 2; return 1; }
export function computeTierFromMasteryAvg(avg: number, currentTier: 1 | 2 | 3): 1 | 2 | 3 {
  if (avg >= GAME_CONFIG.mastery.promoteTo3At) return 3;
  if (avg >= GAME_CONFIG.mastery.promoteTo2At) return 2;
  if (currentTier === 3 && avg < GAME_CONFIG.mastery.demoteTo2Below) return 2;
  if (currentTier === 2 && avg < GAME_CONFIG.mastery.demoteTo1Below) return 1;
  return 1;
}
