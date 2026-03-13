"use client";
import { useMemo, useState } from "react";
import { GAME_CONFIG } from "@/engine/constants/gameConfig";
import { calculateLevel } from "@/engine/systems/XPSystem";
export function useGameState(initialXp = 0) { const [xp, setXp] = useState(initialXp); const [playerHP, setPlayerHP] = useState(GAME_CONFIG.playerMaxHP); const [enemyHP, setEnemyHP] = useState(GAME_CONFIG.enemyMaxHP); const level = useMemo(() => calculateLevel(xp), [xp]); return { xp, level, playerHP, enemyHP, setXp, setPlayerHP, setEnemyHP }; }
