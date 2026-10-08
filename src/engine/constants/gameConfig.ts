export const GAME_CONFIG = {
  playerMaxHP: 100,
  enemyMaxHP: 100,
  questionCount: { training: 15, certification: 15, testNow: 15 },
  timerByTier: { 1: 35, 2: 30, 3: 25, 4: 22, 5: 20 },
  xpByTier: { 1: 15, 2: 25, 3: 40, 4: 55, 5: 75 },
  playerDamageByTier: { 1: 8, 2: 12, 3: 16, 4: 20, 5: 24 },
  enemyDamageByTier: { 1: 12, 2: 18, 3: 25, 4: 32, 5: 40 },
  mastery: { gainBase: 0.5, lossWrong: 0.2, promoteTo2At: 55, promoteTo3At: 78, demoteTo2Below: 72, demoteTo1Below: 48 },
  speedBonusDivisor: 4,
} as const;
export type GameDifficultyTier = keyof typeof GAME_CONFIG.xpByTier;
