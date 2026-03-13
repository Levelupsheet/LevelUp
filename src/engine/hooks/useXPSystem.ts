"use client";
import { useCallback } from "react";
import { calculateQuestionXP, calculateSpeedBonus } from "@/engine/systems/XPSystem";
export function useXPSystem() { const xpForQuestion = useCallback((difficulty?: number | null) => calculateQuestionXP(difficulty), []); const speedBonus = useCallback((secondsLeft: number) => calculateSpeedBonus(secondsLeft), []); return { xpForQuestion, speedBonus }; }
