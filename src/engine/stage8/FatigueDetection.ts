
export function detectFatigue(session) {
  const { responseTimes, incorrectStreak } = session;

  const avgTime = responseTimes.reduce((a,b)=>a+b,0) / (responseTimes.length || 1);

  if (avgTime > 15 || incorrectStreak >= 3) {
    return {
      fatigued: true,
      action: "ease_difficulty"
    };
  }

  return { fatigued: false };
}
