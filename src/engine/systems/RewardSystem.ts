export type RewardSummary = { xpAwarded: number; speedBonus: number; totalAwarded: number; };
export function buildRewardSummary(xpAwarded: number, speedBonus = 0): RewardSummary { return { xpAwarded, speedBonus, totalAwarded: xpAwarded + speedBonus }; }
