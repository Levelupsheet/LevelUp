import { NextResponse } from 'next/server';
import { getRequestUserId } from '@/app/api/_lib/authUser';
import { loadLearningAttempts } from '@/lib/learningHistory';
import { summarizeLearning } from '@/lib/learningEngine';
import { masteryToTargetDifficulty } from '@/lib/learningProfile';
import { buildPersonalizedLearningPath } from '@/lib/learningPath';
export async function GET(req: Request) {
  try {
    const userId = await getRequestUserId(req);
    if (!userId) return NextResponse.json({error:'Not authenticated'},{status:401});
    const attempts = await loadLearningAttempts(userId);
    const ctx = summarizeLearning(attempts);
    const masteryByDomain = Object.entries(ctx.dimensions.domain).map(([domain,v]) => ({domain:domain.toUpperCase(),mastery:v.mastery,correctCount:v.correct,wrongCount:v.attempts-v.correct,accuracy:v.accuracy*100,currentDifficulty:masteryToTargetDifficulty(v.mastery)}));
    const weakest = masteryByDomain.filter(q=>q.correctCount+q.wrongCount>=2 && q.mastery<85).sort((a,b)=>a.mastery-b.mastery);
    const difficultyGroups = new Map<string, {domain:string;difficulty:number;correctCount:number;wrongCount:number}>();
    for (const a of attempts) { const key=`${a.domain}:${a.difficulty}`; const row=difficultyGroups.get(key) || {domain:a.domain.toUpperCase(),difficulty:a.difficulty,correctCount:0,wrongCount:0}; if (a.correct) row.correctCount++; else row.wrongCount++; difficultyGroups.set(key,row); }
    const learningPath = await buildPersonalizedLearningPath(userId);
    return NextResponse.json({ok:true,profile:{overallMastery:masteryByDomain.length ? masteryByDomain.reduce((n,q)=>n+q.mastery,0)/masteryByDomain.length : 0,weakestDomains:weakest.slice(0,3).map(q=>q.domain),masteryByDomain,accuracyByDifficulty:[...difficultyGroups.values()].map(q=>({...q,accuracy:q.correctCount/(q.correctCount+q.wrongCount)*100})),recentHistory:ctx.recentHistory,dimensions:ctx.dimensions},learningPath,predictedWeakness:learningPath.subdomainWeakness.slice(0,3).map(q=>({...q,predictedRisk:q.mastery<=40?'HIGH':q.mastery<=60?'MEDIUM':'LOW'})),learningProgress:{weakestDomain:weakest[0]?.domain || null,weakestDomainMastery:weakest[0]?.mastery || 0,questionsToMaster:ctx.missedQuestionIds.size,masteredMissedCount:[...ctx.missedStats].filter(([id,q])=>q.misses>0 && !ctx.missedQuestionIds.has(id)).length,masteryThreshold:3}});
  } catch(e:any) {return NextResponse.json({error:e.message},{status:500});}
}
