const {test} = require('node:test'); const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const ts=require('typescript');
const resolve=Module._resolveFilename;Module._resolveFilename=function(r,p,...a){if(r.startsWith('@/'))r=path.join(__dirname,'../src',r.slice(2));return resolve.call(this,r,p,...a);};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {cycleCandidates,masteryFor,summarizeLearning,learningRecommendations,learningScope}=require('../src/lib/learningEngine.ts');
const attempt=(id,correct=true,extra={})=>({questionId:id,sessionId:'s',setId:'pool',industry:'Healthcare',careerPath:'Nursing',scopeKey:'scope',domain:'patient_safety',subdomain:'hygiene',type:'multiple_choice',difficulty:4,correct,score:correct?1:0,answeredAt:'2026-10-01T00:00:00.000Z',...extra});
test('unseen cycle finishes partial remainder, restarts fairly, prioritizes new pool additions',()=>{
 const q=['a','b','c','d'].map(id=>({id}));let counts=new Map();
 assert.deepEqual(cycleCandidates(q,counts).questions.map(q=>q.id),['a','b','c','d']);
 counts=new Map([['a',1],['b',1],['c',1]]);assert.deepEqual(cycleCandidates(q,counts).questions.map(q=>q.id),['d']);
 counts.set('d',1);assert.equal(cycleCandidates(q,counts).cycle,2);
 counts=new Map([['a',1]]);assert.deepEqual(cycleCandidates(q,counts,2).questions.map(q=>q.id),['b','c','d']);
 counts=new Map(q.map(q=>[q.id,1])); assert.deepEqual(cycleCandidates([...q,{id:'new'}],counts,10).questions.map(q=>q.id),['new']);
 counts.set('new',1);assert.equal(cycleCandidates([...q,{id:'new'}],counts,10).cycle,11);assert.equal(cycleCandidates([...q,{id:'new'}],counts,10).questions.length,5);
});
test('mastery requires varied evidence and hard coverage, decreases after mistakes',()=>{
 assert.equal(masteryFor(Array.from({length:100},(_,i)=>attempt('one',true,{sessionId:`s${i}`}))),55);
 const easy=Array.from({length:20},(_,i)=>attempt(`q${i}`,true,{difficulty:1}));assert.equal(masteryFor(easy),80);
 const diverse=Array.from({length:20},(_,i)=>attempt(`q${i}`));assert.ok(masteryFor(diverse)>85);
 const mistakes=Array.from({length:20},(_,i)=>attempt(`q${i}`,false,{answeredAt:'2026-10-02T00:00:00.000Z'}));assert.ok(masteryFor([...diverse,...mistakes])<masteryFor(diverse));
});
test('missed questions clear only after spaced success in three different sessions; later misses reopen',()=>{
 const history=[attempt('q',false),...Array.from({length:3},(_,i)=>attempt('q',true,{sessionId:'same',answeredAt:`2026-10-02T0${i}:00:00.000Z`}))];assert.equal(summarizeLearning(history).missedQuestionIds.has('q'),true);
 const spaced=[attempt('q',false),...Array.from({length:3},(_,i)=>attempt('q',true,{sessionId:`s${i}`,answeredAt:`2026-10-0${i+2}T00:00:00.000Z`}))];assert.equal(summarizeLearning(spaced).missedQuestionIds.has('q'),false);
 assert.equal(summarizeLearning([...spaced,attempt('q',false,{answeredAt:'2026-10-05T00:00:00.000Z'})]).missedQuestionIds.has('q'),true);
});
test('dimensions preserve arbitrary careers, pools, domains, formats and tiers',()=>{
 const s=summarizeLearning([attempt('a',false),attempt('b',false),attempt('c',true,{setId:'other',difficulty:5,type:'cli_command'})]);
 assert.equal(s.weakestDomain,'patient_safety');assert.equal(s.dimensions.pool.pool.attempts,2);assert.equal(s.dimensions.difficulty['5'].attempts,1);assert.equal(s.dimensions.format.cli_command.attempts,1);assert.equal(Object.keys(s.dimensions.career).length,1);
 assert.notEqual(learningScope({lane:'TRAINING',industry:'Healthcare',careerPath:'Nursing'}),learningScope({lane:'TRAINING',industry:'Sales',careerPath:'Nursing'}));
 assert.ok(learningRecommendations([attempt('a',false),attempt('b',false)]).some(r=>r.includes('patient safety')));
 assert.ok(!learningRecommendations([attempt('a',false,{type:'multi_select'}),attempt('b',false,{type:'multi_select'})]).some(r=>r.includes('multi select')));
});
test('weakness ranking selects fresh alternatives without duplicating a question in one session',()=>{
 const prismaPath=path.join(__dirname,'../src/lib/prisma.ts');require.cache[prismaPath]={id:prismaPath,filename:prismaPath,loaded:true,exports:{prisma:{}}};
 const {weightedAdaptiveQuestionPlan}=require('../src/lib/adaptiveEngine.ts');
 const learning=summarizeLearning([attempt('miss-a',false),attempt('miss-b',false),...Array.from({length:12},(_,i)=>attempt(`strong${i}`,true,{domain:'sales'}))]);
 const questions=[{id:'fresh-weak',domainId:'patient_safety'},{id:'fresh-strong',domainId:'sales'},{id:'miss-a',domainId:'patient_safety'}].map(q=>({...q,type:'multiple_choice',level:4,data:{},prompt:'Choose a safe action'}));
 const picked=weightedAdaptiveQuestionPlan({questions,questionCount:1,learning,blueprint:[{mode:'weakness',difficulty:4,weakFocus:true}]});assert.equal(picked[0].id,'fresh-weak');
 const all=weightedAdaptiveQuestionPlan({questions,questionCount:15,learning});assert.equal(new Set(all.map(q=>q.id)).size,all.length);assert.equal(all.length,3);
});
test('individual question mastery can advance through spaced reinforcement without inflating domain mastery',()=>{
 const history=Array.from({length:3},(_,i)=>attempt('one',true,{sessionId:`s${i}`,answeredAt:`2026-10-0${i+1}T00:00:00.000Z`}));
 const s=summarizeLearning(history);assert.equal(s.dimensions.question.one.mastery,100);assert.equal(s.masteryByDomain.patient_safety,55);
});
test('database bank selection scopes real cycles and admits new content before recycling the full bank',async()=>{
 const {buildQuestionBankSelection}=require('../src/lib/questionBank.ts');
 const raw=['a','b','c'].map(id=>({id,setId:'pool',prompt:`Choose the safe action for patient ${id}.`,type:'MULTIPLE_CHOICE',choices:['Clean equipment','Skip cleaning'],correctIndex:0,difficulty:1,explanation:'Cleaning equipment prevents transmission of infection.',data:{domainId:'patient_safety'},sortOrder:0}));
 const history=[];const queries=[];
 const db={questionSetPlacement:{findMany:async({where})=>{queries.push(where);return [{id:'placement',setId:'pool',lane:'TRAINING',isActive:true,set:{id:'pool',name:'Nursing hygiene',status:'PUBLISHED',domain:'GENERAL',questions:raw}}];}},gameSession:{findFirst:async()=>history.length?{learningCycle:Math.max(...history.map(h=>h.cycle))}:null},gameSessionQuestion:{findMany:async()=>[],groupBy:async({where})=>{const counts=new Map();for(const h of history.filter(h=>h.cycle===where.session.learningCycle))for(const id of h.ids)counts.set(id,(counts.get(id)||0)+1);return [...counts].map(([questionId,count])=>({questionId,_count:{questionId:count}}));}}};
 const args={lane:'TRAINING',industry:'Healthcare',careerPath:'Nursing',userId:'u',questionCount:2,shouldShuffle:false};
 const allocate=async()=>{const bank=await buildQuestionBankSelection(args,db);history.push({cycle:bank.exposureCycle.cycle,ids:bank.selectedQuestions.map(q=>q.id)});return bank;};
 const first=await allocate();assert.equal(first.selectedQuestions.length,2);assert.equal(first.selectedQuestions[0].domainId,'patient_safety');
 const remainder=await allocate();assert.equal(remainder.selectedQuestions.length,1);assert.ok(!first.selectedQuestions.some(q=>q.id===remainder.selectedQuestions[0].id));
 raw.push({...raw[0],id:'new',prompt:'Choose a safe action for a newly admitted patient.'});
 const addition=await allocate();assert.deepEqual(addition.selectedQuestions.map(q=>q.id),['new']);assert.equal(addition.exposureCycle.cycle,1);
 const recycled=await allocate();assert.equal(recycled.exposureCycle.cycle,2);assert.equal(recycled.selectedQuestions.length,2);
 assert.ok(queries.every(q=>q.industry==='Healthcare'&&q.careerPath==='Nursing'&&q.isActive&&q.set.status==='PUBLISHED'));
 const noBaseline=await buildQuestionBankSelection({...args,weakDomainTraining:true},db);assert.equal(noBaseline.selectedQuestions.length,0);
});
