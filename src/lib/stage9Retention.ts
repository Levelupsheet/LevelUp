
export type DailyStreakSnapshot = {
  streakDays: number;
  lastActiveDate: string | null;
  tomorrowBonusTokens: number;
  momentumLabel: string;
};

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function yesterdayKey(date = new Date()) {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}

export function computeDailyStreak(input?: { streakDays?: number; lastActiveDate?: string | null }, now = new Date()): DailyStreakSnapshot {
  const today = dayKey(now);
  const yesterday = yesterdayKey(now);
  const priorStreak = Math.max(0, Number(input?.streakDays || 0));
  const lastActive = input?.lastActiveDate || null;

  let streakDays = priorStreak;
  if (!lastActive) streakDays = 1;
  else if (lastActive === today) streakDays = Math.max(1, priorStreak);
  else if (lastActive === yesterday) streakDays = priorStreak + 1;
  else streakDays = 1;

  const tomorrowBonusTokens = Math.min(25, 5 + Math.max(0, streakDays - 1) * 2);
  const momentumLabel =
    streakDays >= 7 ? "Elite momentum" :
    streakDays >= 3 ? "Streak building" :
    "Fresh start";

  return {
    streakDays,
    lastActiveDate: today,
    tomorrowBonusTokens,
    momentumLabel,
  };
}
