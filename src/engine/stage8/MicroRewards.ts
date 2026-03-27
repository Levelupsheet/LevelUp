
export function getMicroReward(state) {
  const streak = state.correctStreak || 0;

  if (streak > 0 && streak % 2 === 0) {
    return {
      xp: 5,
      message: "Streak bonus!"
    };
  }

  return null;
}
