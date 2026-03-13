export const GOLDEN_WEEKLY_ENTRY_LIMIT = 5;

export function probabilityForGoldenQuestion(sessionsSinceLastGolden: number) {
  const sessions = Math.max(0, Math.floor(Number(sessionsSinceLastGolden || 0)));
  if (sessions <= 3) return 0;
  if (sessions === 4) return 0.02;
  if (sessions === 5) return 0.04;
  if (sessions === 6) return 0.06;
  if (sessions === 7) return 0.08;
  if (sessions === 8) return 0.10;
  if (sessions === 9) return 0.12;
  return 0.15;
}

export function shouldSpawnGoldenQuestion(sessionsSinceLastGolden: number, randomValue = Math.random()) {
  const probability = probabilityForGoldenQuestion(sessionsSinceLastGolden);
  return {
    probability,
    shouldSpawn: randomValue < probability,
  };
}

export function startOfWeekUtc(date = new Date()) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function goldenQuestionMeta(sessionsSinceLastGolden: number) {
  const probability = probabilityForGoldenQuestion(sessionsSinceLastGolden);
  return {
    probability,
    percent: Math.round(probability * 100),
    sessionsSinceLastGolden: Math.max(0, Math.floor(Number(sessionsSinceLastGolden || 0))),
    weeklyEntryLimit: GOLDEN_WEEKLY_ENTRY_LIMIT,
  };
}
