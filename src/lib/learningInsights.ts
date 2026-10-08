import { summarizeLearning, learningRecommendations, masteryFor, type LearningAttempt } from './learningEngine';

const DAY = 86400000;
const percent = (rows: LearningAttempt[]) => rows.length ? Math.round(rows.filter(a => a.correct).length / rows.length * 1000) / 10 : null;
export function buildLearningInsights(attempts: LearningAttempt[], sessions: { status: string }[], timezone = 'UTC', now = new Date()) {
  const context = summarizeLearning(attempts);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const dayKey = (date: Date) => { const p = formatter.formatToParts(date); return ['year','month','day'].map(type => p.find(v => v.type === type)!.value).join('-'); };
  const today = dayKey(now);
  const ordinal = (day: string) => Math.round(Date.parse(day + 'T00:00:00Z') / DAY);
  const daily = new Map<string, LearningAttempt[]>();
  for (const attempt of attempts) { const day = dayKey(new Date(attempt.answeredAt)); const rows = daily.get(day) || []; rows.push(attempt); daily.set(day, rows); }
  const activeDays = [...daily.keys()].sort();
  const days = new Set(activeDays.map(ordinal));
  let cursor = ordinal(today), streak = 0;
  if (!days.has(cursor)) cursor--;
  while (days.has(cursor)) { streak++; cursor--; }
  let bestStreak = 0, run = 0, previous = -Infinity;
  for (const day of activeDays.map(ordinal)) { run = day === previous + 1 ? run + 1 : 1; bestStreak = Math.max(bestStreak, run); previous = day; }
  const recent = attempts.filter(a => Date.parse(a.answeredAt) >= now.getTime() - 7 * DAY && Date.parse(a.answeredAt) <= now.getTime());
  const prior = attempts.filter(a => Date.parse(a.answeredAt) >= now.getTime() - 14 * DAY && Date.parse(a.answeredAt) < now.getTime() - 7 * DAY);
  const unique = new Set(attempts.map(a => a.questionId)).size;
  const hard = new Set(attempts.filter(a => a.correct && a.difficulty >= 4).map(a => a.questionId)).size;
  const mastery = masteryFor(attempts);
  const sufficientEvidence = attempts.length >= 20 && unique >= 10 && hard >= 3;
  const readiness = !sufficientEvidence ? 'Building evidence' : mastery >= 80 ? 'Consistent practice performance' : 'Needs reinforcement';
  return {
    summary: { attempts: attempts.length, distinctQuestions: unique, accuracy: percent(attempts), mastery, sessions: sessions.length, completedSessions: sessions.filter(s => s.status === 'COMPLETED').length, missedQuestions: context.missedQuestionIds.size, recoveredQuestions: [...context.missedStats].filter(([id, row]) => row.misses > 0 && !context.missedQuestionIds.has(id)).length },
    readiness: { label: readiness, sufficientEvidence, correctHardQuestions: hard, explanation: 'Practice evidence only; this does not predict an exam result. Evidence requires 20 answers, 10 distinct questions and 3 distinct correct tier 4–5 questions.' },
    activity: { timezone, currentStreak: streak, bestStreak, activeDays: activeDays.length, practicedToday: days.has(ordinal(today)), days: Array.from({ length: 14 }, (_, i) => { const date = new Date((ordinal(today) - 13 + i) * DAY).toISOString().slice(0,10); const rows = daily.get(date) || []; return { date, attempts: rows.length, accuracy: percent(rows) }; }) },
    trend: { recentAccuracy: percent(recent), priorAccuracy: percent(prior), change: recent.length && prior.length ? Math.round((percent(recent)! - percent(prior)!) * 10) / 10 : null, recentAttempts: recent.length, priorAttempts: prior.length },
    dimensions: context.dimensions,
    recommendations: learningRecommendations(attempts),
  };
}
