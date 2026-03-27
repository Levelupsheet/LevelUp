
export function getMomentum(state) {
  const streak = state.correctStreak || 0;
  return {
    nextRewardIn: Math.max(1, 3 - (streak % 3)),
    xpBoostActive: streak >= 3,
    xpMultiplier: streak >= 3 ? 1.5 : 1
  };
}
