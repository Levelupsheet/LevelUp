const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const ts=require('typescript');
const resolve=Module._resolveFilename;Module._resolveFilename=function(r,p,...a){if(r.startsWith('@/'))r=path.join(__dirname,'../src',r.slice(2));return resolve.call(this,r,p,...a);};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
function mock(f,exports){const filename=path.join(__dirname,'../src',f);require.cache[filename]={id:filename,filename,loaded:true,exports};}
let authId='u', sessions=[], questions=[], writes=0;
const db={
 $executeRawUnsafe:async()=>0,$queryRawUnsafe:async()=>[],
 gameSession:{findFirst:async({where})=>sessions.find(s=>s.id===where.id&&s.userId===where.userId),findUnique:async({where,include})=>{const s=sessions.find(s=>s.id===where.id);return include?{...s,questions:questions.filter(q=>q.sessionId===s.id)}:s;},update:async({where,data})=>{const s=sessions.find(s=>s.id===where.id);Object.assign(s,Object.fromEntries(Object.entries(data).filter(([,v])=>v!==undefined)));return s;}},
 gameSessionQuestion:{findUnique:async({where})=>questions.find(q=>q.id===where.id),update:async({where,data})=>{writes++;const q=questions.find(q=>q.id===where.id);Object.assign(q,data);return q;},findMany:async({where})=>questions.filter(q=>q.answered && sessions.find(s=>s.id===q.sessionId)?.userId===where.session.userId).map(q=>({...q,session:sessions.find(s=>s.id===q.sessionId)}))},
};
// Model PostgreSQL's per-session serial execution for concurrent API calls.
let lock=Promise.resolve();db.$transaction=fn=>{const result=lock.then(()=>fn(db));lock=result.catch(()=>{});return result;};
mock('lib/prisma.ts',{prisma:db});mock('lib/auth/session.ts',{getSessionUser:async()=>({id:authId})});mock('lib/raffle.ts',{getOrCreateActiveGoldenSweepstakes:async()=>null});mock('lib/sweepstakesCampaignMeta.ts',{getSweepstakesCampaignMetaMap:async()=>new Map()});
mock('lib/explanations.ts',{buildQuestionExplanation:()=> 'A resolves the issue.'});
const {PATCH}=require('../src/app/api/test-now/session/route.ts');
const req=body=>new Request('http://localhost/api/learning/session',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function setup(){authId='u';writes=0; sessions=[{id:'s',userId:'u',lane:'TRAINING',scopeKey:'scope',status:'ACTIVE',currentIndex:0,questionCount:2,stateJson:{},industry:'Healthcare',careerPath:'Nursing'},{id:'foreign',userId:'other',lane:'TRAINING'}];questions=[{id:'sq',sessionId:'s',questionId:'q',orderIndex:0,answered:false,isCorrect:null,payloadJson:{id:'q',setId:'pool',type:'multiple_choice',prompt:'Which answer resolves the issue?',choices:['A','B'],correctIndex:0,difficulty:4,domainId:'patient_safety'}},{id:'foreign-q',sessionId:'foreign',questionId:'secret',answered:false,isCorrect:null,payloadJson:{}}];}
test('server grades its stored answer, counts concurrent replays once, and preserves the original result',async()=>{
 setup();const body={sessionId:'s',currentIndex:1,answeredQuestions:[{sessionQuestionId:'sq',selectedAnswer:'B',isCorrect:true}]};
 const responses=await Promise.all([PATCH(req(body)),PATCH(req(body))]);assert.ok(responses.every(r=>r.status===200));assert.equal(writes,1);assert.equal(questions[0].isCorrect,false);
 const retry=await PATCH(req({...body,answeredQuestions:[{sessionQuestionId:'sq',selectedAnswer:'A'}]}));assert.equal(retry.status,200);assert.equal(writes,1);assert.equal(questions[0].isCorrect,false);
 const {loadLearningAttempts}=require('../src/lib/learningHistory.ts');const attempts=await loadLearningAttempts('u');assert.equal(attempts.length,1);assert.equal(attempts[0].setId,'pool');assert.equal(attempts[0].careerPath,'Nursing');
});
test('foreign session and question IDs cannot mutate another learner history',async()=>{
 setup();const oldError=console.error;console.error=()=>{};
 try {assert.equal((await PATCH(req({sessionId:'foreign'}))).status,404);const response=await PATCH(req({sessionId:'s',answeredQuestions:[{sessionQuestionId:'foreign-q',selectedAnswer:'A'}]}));assert.equal(response.status,400);assert.equal(writes,0);assert.equal(questions[1].answered,false);}finally{console.error=oldError;}
});
test('late progress saves do not move the session backwards; unanswered completed sessions cannot acquire fabricated answers',async()=>{
 setup();await PATCH(req({sessionId:'s',currentIndex:2,status:'COMPLETED'}));await PATCH(req({sessionId:'s',currentIndex:0}));assert.equal(sessions[0].currentIndex,2);
 const oldError=console.error;console.error=()=>{};try{assert.equal((await PATCH(req({sessionId:'s',answeredQuestions:[{sessionQuestionId:'sq',selectedAnswer:'A'}]}))).status,400);assert.equal(writes,0);}finally{console.error=oldError;}
});
