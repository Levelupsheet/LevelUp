export const XP_PER_LEVEL = 500;

export function normalizeXp(xp: number) {
  return Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
}

export function levelFromXp(xp: number): number {
  const safe = normalizeXp(xp);
  return Math.floor(safe / XP_PER_LEVEL) + 1;
}

export function xpIntoCurrentLevel(xp: number): number {
  const safe = normalizeXp(xp);
  return safe % XP_PER_LEVEL;
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
