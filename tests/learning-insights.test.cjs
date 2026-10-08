const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {buildLearningInsights}=require('../src/lib/learningInsights.ts');
const now=new Date('2026-10-08T20:00:00Z');
const answer=(id,date,correct=true,sessionId=id)=>({questionId:id,sessionId,setId:'pool',domain:'networking',subdomain:'dns',type:'multiple_choice',difficulty:4,correct,score:correct?1:0,answeredAt:date});
test('new learner has no invented accuracy, trend or readiness',()=>{
 const d=buildLearningInsights([],[],'America/New_York',now);assert.equal(d.summary.accuracy,null);assert.equal(d.trend.change,null);assert.equal(d.activity.currentStreak,0);assert.equal(d.readiness.sufficientEvidence,false);assert.equal(d.recommendations.length,1);
});
test('streak follows local learning dates and tolerates an unfinished today',()=>{
 const rows=[answer('a','2026-10-06T23:00:00Z'),answer('b','2026-10-07T23:00:00Z'),answer('c','2026-10-08T02:00:00Z')];
 const d=buildLearningInsights(rows,[],'America/New_York',now);assert.equal(d.activity.currentStreak,2);assert.equal(d.activity.activeDays,2);assert.equal(d.activity.practicedToday,false);
 const expired=buildLearningInsights(rows,[],'America/New_York',new Date('2026-10-10T20:00:00Z'));assert.equal(expired.activity.currentStreak,0);assert.equal(expired.activity.bestStreak,2);
});
test('DST activity is based on calendar days rather than 24-hour gaps',()=>{
 const d=buildLearningInsights([answer('a','2026-03-07T17:00:00Z'),answer('b','2026-03-08T16:00:00Z'),answer('c','2026-03-09T16:00:00Z')],[],'America/New_York',new Date('2026-03-09T19:00:00Z'));assert.equal(d.activity.currentStreak,3);
});
test('repeating one question cannot produce sufficient readiness evidence',()=>{
 const d=buildLearningInsights(Array.from({length:30},(_,i)=>answer('same','2026-10-08T12:00:00Z',true,String(i))),[],'UTC',now);assert.equal(d.readiness.sufficientEvidence,false);assert.equal(d.summary.distinctQuestions,1);assert.ok(d.summary.mastery<=55);
});
test('trend compares disjoint windows and recommendations reflect actual misses',()=>{
 const rows=[answer('old','2026-09-29T12:00:00Z',false),answer('new','2026-10-07T12:00:00Z',true)];
 const d=buildLearningInsights(rows,[{status:'COMPLETED'},{status:'ACTIVE'}],'UTC',now);assert.equal(d.trend.change,100);assert.equal(d.trend.recentAttempts,1);assert.equal(d.trend.priorAttempts,1);assert.equal(d.summary.completedSessions,1);assert.equal(d.summary.missedQuestions,1);assert.ok(d.recommendations.some(r=>r.includes('missed')));
});
test('broad hard-question success provides evidence but never an exam guarantee',()=>{
 const rows=Array.from({length:20},(_,i)=>answer('q'+i,'2026-10-08T12:00:00Z'));
 const d=buildLearningInsights(rows,[],'UTC',now);assert.equal(d.readiness.sufficientEvidence,true);assert.equal(d.readiness.label,'Consistent practice performance');assert.match(d.readiness.explanation,/does not predict/);
});
