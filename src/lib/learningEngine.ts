/** Deterministic learning rules, independent of rewards and combat presentation. */
export type LearningAttempt = { questionId: string; sessionId: string; setId?: string; scopeKey?: string; careerPath?: string; industry?: string; domain: string; subdomain: string; type: string; difficulty: number; correct: boolean; score: number; answeredAt: string };
const key = (v: unknown) => String(v || 'general').trim().toLowerCase();
export function learningScope(args: any) {
  const lane = String(args.lane || 'TEST_NOW').toUpperCase();
  return JSON.stringify([lane, lane === 'TRAINING' ? args.industry || '' : '', lane === 'TRAINING' ? args.careerPath || args.startingPosition || '' : '', lane === 'CERTIFICATIONS' ? args.certExam || '' : '', lane === 'TEST_NOW' ? args.bankDomain || 'MIXED' : '']);
}
export function cycleCandidates<T extends { id: string }>(questions: T[], counts: Map<string, number>, currentCycle = 1) {
  const unseen = questions.filter(q => !counts.get(q.id));
  const reset = questions.length > 0 && unseen.length === 0;
  return { questions: reset ? questions : unseen, cycleReset: reset, seenCount: questions.length-unseen.length, cycle: reset ? currentCycle + 1 : currentCycle };
}
export function masteryFor(attempts: LearningAttempt[]) {
  if (!attempts.length) return 0;
  // Recent evidence, with diminishing returns for repeating one answer.
  const perQuestion = new Map<string, LearningAttempt[]>();
  for (const a of [...attempts].sort((a,b) => b.answeredAt.localeCompare(a.answeredAt))) { const rows = perQuestion.get(a.questionId) || []; if (rows.length < 3) rows.push(a); perQuestion.set(a.questionId,rows); }
  let weight = 0, earned = 0;
  for (const rows of perQuestion.values()) rows.forEach((a,i) => { const w = (1 / (i + 1)) * (1 + (a.difficulty - 1) * .15); weight += w; earned += Math.max(0,Math.min(1,a.score)) * w; });
  const hardCoverage = new Set(attempts.filter(a => a.correct && a.difficulty >= 4).map(a => a.questionId)).size;
  const distinct = perQuestion.size;
  const ceiling = distinct < 2 ? 55 : distinct < 4 ? 65 : distinct < 8 || hardCoverage < 3 ? 80 : 100;
  return Math.round(Math.min(ceiling, 100 * (earned + 1) / (weight + 2)) * 10) / 10;
}
export function questionMastery(attempts: LearningAttempt[]) {
  const sessions = new Set<string>();
  const recent = [...attempts].sort((a,b) => b.answeredAt.localeCompare(a.answeredAt)).filter(a => { if (sessions.has(a.sessionId)) return false; sessions.add(a.sessionId); return true; }).slice(0,3);
  if (recent.length === 3 && recent.every(a=>a.correct) && Date.parse(recent[0].answeredAt)-Date.parse(recent[2].answeredAt)>=86400000) return 100;
  return Math.min(80, Math.round(100 * (recent.reduce((n,a)=>n+a.score,0)+1)/(recent.length+2)));
}
export function summarizeLearning(attempts: LearningAttempt[]) {
  const sorted = [...attempts].sort((a,b) => a.answeredAt.localeCompare(b.answeredAt));
  const dimensions = { career: {} as Record<string,any>, pool: {} as Record<string,any>, domain: {} as Record<string,any>, question: {} as Record<string,any>, difficulty: {} as Record<string,any>, format: {} as Record<string,any>, subdomain: {} as Record<string,any> };
  const buckets: Record<string,Map<string,LearningAttempt[]>> = Object.fromEntries(Object.keys(dimensions).map(d => [d,new Map()]));
  const lastAnswered = new Map<string,string>();
  const missed = new Map<string,{ misses: number; recoveryCorrect: number; sessions: Set<string>; firstCorrectAt?: string }>();
  for (const a of sorted) {
    lastAnswered.set(a.questionId,a.answeredAt);
    const values = { career: JSON.stringify([a.industry || '',a.careerPath || a.scopeKey || '']), pool: a.setId || 'legacy', domain: key(a.domain), question: a.questionId, difficulty: String(a.difficulty), format: key(a.type), subdomain: `${key(a.domain)}:${key(a.subdomain)}` };
    for (const [d,k] of Object.entries(values)) { const rows = buckets[d].get(k) || []; rows.push(a); buckets[d].set(k,rows); }
    const m = missed.get(a.questionId) || { misses: 0, recoveryCorrect: 0, sessions: new Set<string>() };
    if (!a.correct) { m.misses++; m.recoveryCorrect=0; m.sessions.clear(); m.firstCorrectAt=undefined; }
    else if (m.misses && !m.sessions.has(a.sessionId)) { m.sessions.add(a.sessionId); m.recoveryCorrect++; m.firstCorrectAt ||= a.answeredAt; }
    missed.set(a.questionId,m);
  }
  for (const [d,map] of Object.entries(buckets)) for (const [k,rows] of map) (dimensions as any)[d][k] = { attempts: rows.length, correct: rows.filter(a => a.correct).length, accuracy: rows.reduce((n,a) => n+a.score,0) / rows.length, mastery: d === "question" ? questionMastery(rows) : masteryFor(rows), distinctQuestions: new Set(rows.map(a => a.questionId)).size, lastAnsweredAt: rows[rows.length-1].answeredAt };
  const missedQuestionIds = new Set([...missed].filter(([id,m]) => {
    return m.misses > 0 && (m.recoveryCorrect < 3 || !m.firstCorrectAt || Date.parse(lastAnswered.get(id)!) - Date.parse(m.firstCorrectAt) < 86400000);
  }).map(([id]) => id));
  const mapMastery = (d: Record<string,any>) => Object.fromEntries(Object.entries(d).map(([k,v]) => [k,v.mastery as number]));
  const weakest = Object.entries(dimensions.domain).filter(([,v]) => v.attempts >= 2 && v.mastery < 85).sort((a,b) => a[1].mastery-b[1].mastery)[0]?.[0];
  const measuredMastery = weakest ? dimensions.domain[weakest].mastery : Object.values(dimensions.domain).length ? Object.values(dimensions.domain).reduce((n,v)=>n+v.mastery,0)/Object.values(dimensions.domain).length : 0;
  const recent = sorted.slice(-150).reverse();
  const wrong = recent.find(a => !a.correct);
  return { dimensions, missedQuestionIds, missedStats: missed, masteryByDomain: mapMastery(dimensions.domain), masteryBySubdomain: mapMastery(dimensions.subdomain), masteryByQuestionType: mapMastery(dimensions.format), recentHistory: recent.map(a => ({ questionId:a.questionId,correct:a.correct,score:a.score,seenAt:a.answeredAt })), recentQuestionIds: new Set(recent.slice(0,20).map(a => a.questionId)), exposureQuestionIds24h: new Set(recent.filter(a => Date.now()-Date.parse(a.answeredAt)<86400000).map(a=>a.questionId)), lastWrongDomain: wrong ? key(wrong.domain) : null, lastWrongSubdomain: wrong ? key(wrong.subdomain) : null, lastWrongQuestionType: wrong ? key(wrong.type) : null, weakestDomain: weakest || '', weakestTargetDifficulty: (measuredMastery >= 90 ? 5 : measuredMastery >= 80 ? 4 : measuredMastery >= 70 ? 3 : measuredMastery >= 40 ? 2 : 1) as 1|2|3|4|5 };
}
export function learningRecommendations(attempts: LearningAttempt[]) {
  const s = summarizeLearning(attempts);
  if (!attempts.length) return ['Complete a practice session to establish your learning baseline.'];
  const recommendations: string[] = [];
  if (s.missedQuestionIds.size) recommendations.push(`Review ${s.missedQuestionIds.size} missed questions, then reinforce them in later sessions.`);
  if (s.weakestDomain) recommendations.push(`Practice ${s.weakestDomain.replaceAll('_',' ')} with fresh questions; current mastery is ${s.masteryByDomain[s.weakestDomain]}%.`);
  const weakFormat = Object.entries(s.dimensions.format).filter(([k,v]) => ['multiple_choice','true_false','cli_command'].includes(k) && v.attempts >= 2 && v.mastery < 70).sort((a,b)=>a[1].mastery-b[1].mastery)[0];
  if (weakFormat) recommendations.push(`Practice ${weakFormat[0].replaceAll('_',' ')} to strengthen this format.`);
  if (!recommendations.length) recommendations.push('Continue mixed practice with new questions and harder tiers to verify retention.');
  return recommendations;
}
