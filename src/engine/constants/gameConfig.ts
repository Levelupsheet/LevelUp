export const GAME_CONFIG = {
  playerMaxHP: 100,
  enemyMaxHP: 100,
  questionCount: { training: 8, certification: 8, testNow: 10 },
  timerByTier: { 1: 25, 2: 18, 3: 12 },
  xpByTier: { 1: 15, 2: 25, 3: 40 },
  playerDamageByTier: { 1: 10, 2: 15, 3: 20 },
  enemyDamageByTier: { 1: 12, 2: 18, 3: 25 },
  mastery: { gainBase: 4, lossWrong: 2, promoteTo2At: 70, promoteTo3At: 85, demoteTo2Below: 80, demoteTo1Below: 65 },
  speedBonusDivisor: 4,
} as const;
export type GameDifficultyTier = keyof typeof GAME_CONFIG.xpByTier;
