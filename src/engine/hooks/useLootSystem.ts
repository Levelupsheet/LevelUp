"use client";
import { useCallback } from "react";
import { buildRewardSummary } from "@/engine/systems/RewardSystem";
export function useLootSystem() { const summarizeReward = useCallback((xpAwarded: number, speedBonus = 0) => buildRewardSummary(xpAwarded, speedBonus), []); return { summarizeReward }; }
