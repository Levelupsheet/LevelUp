"use client";
import { useCallback } from "react";
import { clampHp, getEnemyDamageTaken, getPlayerDamageTaken } from "@/engine/systems/CombatSystem";
export function useCombatSystem() { const applyEnemyHit = useCallback((enemyHP: number, difficulty?: number | null) => clampHp(enemyHP - getEnemyDamageTaken(difficulty)), []); const applyPlayerHit = useCallback((playerHP: number, difficulty?: number | null) => clampHp(playerHP - getPlayerDamageTaken(difficulty)), []); return { applyEnemyHit, applyPlayerHit }; }
