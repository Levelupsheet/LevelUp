export const BASE_XP_PER_LEVEL = 500;
export const XP_LEVEL_LINEAR_STEP = 125;
export const XP_LEVEL_CURVE_FACTOR = 20;

export function normalizeXp(xp: number) {
  return Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
}

export function xpRequiredForNextLevel(level: number): number {
  const safe = Math.max(1, Math.floor(Number(level) || 1));
  const offset = safe - 1;
  return Math.floor(BASE_XP_PER_LEVEL + offset * XP_LEVEL_LINEAR_STEP + offset * offset * XP_LEVEL_CURVE_FACTOR);
}

export function xpRequiredToReachLevel(level: number): number {
  const safe = Math.max(1, Math.floor(Number(level) || 1));
  let total = 0;
  for (let current = 1; current < safe; current += 1) total += xpRequiredForNextLevel(current);
  return total;
}

export function levelFromXp(xp: number): number {
  const safe = normalizeXp(xp);
  let level = 1;
  let remaining = safe;
  while (remaining >= xpRequiredForNextLevel(level)) {
    remaining -= xpRequiredForNextLevel(level);
    level += 1;
    if (level > 500) break;
  }
  return level;
}

export function xpIntoCurrentLevel(xp: number): number {
  const safe = normalizeXp(xp);
  const level = levelFromXp(safe);
  return safe - xpRequiredToReachLevel(level);
}

export function xpNeededForCurrentLevel(level: number): number {
  return xpRequiredForNextLevel(level);
}

export function xpRemainingToNextLevel(xp: number): number {
  const safe = normalizeXp(xp);
  const level = levelFromXp(safe);
  const inLevel = xpIntoCurrentLevel(safe);
  return Math.max(0, xpRequiredForNextLevel(level) - inLevel);
}

export function levelTitleFromLevel(level: number): string {
  const safe = Math.max(1, Math.floor(Number(level) || 1));
  if (safe >= 13) return "PRO";
  if (safe >= 9) return "Architect";
  if (safe >= 6) return "Engineer";
  if (safe >= 3) return "Administrator";
  return "Student";
}

export function levelBandLabel(level: number): string {
  return `${levelTitleFromLevel(level)} • Lvl ${Math.max(1, Math.floor(Number(level) || 1))}`;
}
