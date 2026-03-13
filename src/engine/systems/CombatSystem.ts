import { GAME_CONFIG } from "@/engine/constants/gameConfig";
import { normalizeDifficultyTier } from "@/engine/systems/XPSystem";
export function clampHp(value: number) { return Math.max(0, Math.min(GAME_CONFIG.playerMaxHP, Math.floor(value))); }
export function getPlayerDamageTaken(input?: number | null) { const tier = normalizeDifficultyTier(input); return GAME_CONFIG.playerDamageByTier[tier]; }
export function getEnemyDamageTaken(input?: number | null) { const tier = normalizeDifficultyTier(input); return GAME_CONFIG.enemyDamageByTier[tier]; }
