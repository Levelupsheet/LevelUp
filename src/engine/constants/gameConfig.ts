export const GAME_CONFIG = {
  playerMaxHP: 100,
  enemyMaxHP: 100,
  questionCount: { training: 8, certification: 8, testNow: 10 },
  timerByTier: { 1: 25, 2: 18, 3: 12 },
  xpByTier: { 1: 15, 2: 25, 3: 40 },
  playerDamageByTier: { 1: 10, 2: 15, 3: 20 },
  enemyDamageByTier: { 1: 12, 2: 18, 3: 25 },
  mastery: { gainBase: 0.5, lossWrong: 0.2, promoteTo2At: 55, promoteTo3At: 78, demoteTo2Below: 72, demoteTo1Below: 48 },
  speedBonusDivisor: 4,
} as const;
export type GameDifficultyTier = keyof typeof GAME_CONFIG.xpByTier;
