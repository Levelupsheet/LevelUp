export const PRACTICE_MODES = {
  QUICK: { label: 'Quick Quiz', count: 5, timed: true, description: 'Five questions for a quick warm-up.' },
  DIAGNOSTIC: { label: 'Diagnostic', count: 10, timed: false, description: 'Find the topics that need more practice.' },
  STUDY: { label: 'Study Mode', count: 10, timed: false, description: 'Learn at your pace with explanations after each answer.' },
  FULL: { label: 'Full Test', count: 60, timed: true, description: 'Timed practice simulation. One payment unlocks repeat tests for this bank.' },
} as const;
export type PracticeMode = keyof typeof PRACTICE_MODES;
export function practicePrice(value: string | undefined) {
  if (!value || !/^\d{1,3}(\.\d{1,2})?$/.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return cents > 0 ? cents : null;
}
export function selectPracticeQuestions<T extends { id: string; domainId?: string | null }>(rows: T[], seen: string[], missed: string[], count: number, diagnostic = false, random = Math.random) {
  const seenSet = new Set(seen), missedSet = new Set(missed);
  const shuffled = rows.map(row => ({row, tie: random()})).sort((a,b) => Number(seenSet.has(a.row.id)) - Number(seenSet.has(b.row.id)) || Number(missedSet.has(b.row.id)) - Number(missedSet.has(a.row.id)) || a.tie-b.tie).map(r=>r.row);
  if (!diagnostic) return shuffled.slice(0, count);
  const selected: T[] = [], domains = new Set<string>();
  // Sample domain breadth within the unseen partition before recycling seen items.
  for (const partition of [shuffled.filter(q=>!seenSet.has(q.id)), shuffled.filter(q=>seenSet.has(q.id))]) {
    for (const q of partition) if (!domains.has(q.domainId || 'general') && selected.length<count) { selected.push(q); domains.add(q.domainId || 'general'); }
    for (const q of partition) if (!selected.includes(q) && selected.length<count) selected.push(q);
  }
  return selected;
}
