const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {normalizeKnowledgeBlock,mapCandidateToDbQuestion}=require('../src/lib/contentEngine.ts');
const {generateContentReport,duplicateContentReason}=require('../src/lib/contentGeneration.ts');
const {contentImportReport,importEnvelope}=require('../src/lib/contentImport.ts');
const {validateContent}=require('../src/lib/contentPipeline.ts');
const fact={subject:'Example service',statement:'Example service manages requests.',answer:'Request management',distractors:['Storage administration','Report scheduling','Access monitoring'],explanation:'The source assigns request management to Example service.'};
const block=(extra={})=>normalizeKnowledgeBlock({schemaVersion:2,id:'example',setName:'Example pool',industry:'Sales',careerPath:'Account Executive',domain:'GENERAL',domainId:'customer-operations',lane:'TRAINING',difficulty:2,facts:[fact],...extra});
test('generation is deterministic, career-neutral and carries adaptive metadata and safe hints',()=>{
 const a=generateContentReport(block()),b=generateContentReport(block());assert.deepEqual(a,b);assert.equal(a.questions.length,1);assert.equal(a.questions[0].data.careerPath,'Account Executive');assert.equal(a.questions[0].data.domainId,'customer-operations');assert.equal(a.questions[0].difficulty,2);assert.ok(a.questions[0].data.hints.length);assert.ok(a.questions[0].data.hints.every(h=>!h.toLowerCase().includes(fact.answer.toLowerCase())));
 for(const industry of ['Healthcare','Software Development','Real Estate','Transportation','Industrial/Skilled Trades'])assert.equal(generateContentReport(block({industry,careerPath:'Custom role'})).questions[0].data.industry,industry);
});
test('facts and definitions do not multiply one recall concept; changed choices are still duplicates',()=>{
 const r=generateContentReport(block({facts:[fact,fact],definitions:[{term:fact.subject,definition:fact.statement,distractors:['Wrong description one','Wrong description two','Wrong description three']}]}));assert.equal(r.questions.length,1);assert.equal(r.issues.length,2);assert.ok(r.issues.every(i=>i.payload));
 const q=r.questions[0],answer=q.choices[q.correctIndex];const changed={...q,choices:[answer,'A different distractor','Another distractor','Third distractor'],correctIndex:0};assert.match(duplicateContentReason(changed,[q]),/Duplicate/);assert.match(duplicateContentReason({...q,prompt:q.prompt+' ',correctIndex:(q.correctIndex+1)%4},[q]),/Conflicting/);
});
test('unsupported formats, unverified aliases, malformed rows and weak hard-tier labels stay in reports',()=>{
 const r=generateContentReport(block({facts:[{...fact,questionTypes:['multiple_choice','fill_blank','true_false']}],commands:[{command:'one',purpose:'Perform this exact task',aliases:['another API']}],questions:[null,{prompt:'Which answer fits this situation?',type:'multiple_choice',choices:['A','B','C','D'],correctIndex:0,difficulty:5,explanation:'An authored explanation.'}]}));assert.ok(r.issues.some(i=>i.reason.includes('Unsupported')));assert.ok(r.issues.some(i=>i.reason.includes('boolean')));assert.ok(r.issues.some(i=>i.reason.includes('aliases')));assert.ok(r.issues.some(i=>i.reason.includes('evidence')));assert.deepEqual(r.questions.find(q=>q.type==='cli_command').data.expectedCommands,['one']);assert.ok(r.issues.some(i=>i.reason.includes('object')));
});
test('authored hard scenarios and logs become supported MCQ; no hard tier is fabricated from recall',()=>{
 const r=generateContentReport(block({difficulty:5,facts:[fact],scenarios:[{scenario:'The workflow has stopped at its approval gate.',evidence:'An approval is absent.',constraints:['Preserve the submitted request'],correctAnswer:'Obtain the required approval',options:['Obtain the required approval','Delete every submitted request','Disable all workflow logging','Restart unrelated services'],explanation:'The approval gate requires the missing approval before processing can continue.',difficulty:4,bossEligible:true,isGoldenEligible:true}]}));assert.equal(r.questions[0].difficulty,2);const hard=r.questions[1];assert.equal(hard.difficulty,4);assert.equal(hard.goldenEligible,true);assert.equal(hard.data.bossEligible,true);assert.deepEqual(validateContent({...hard,isGoldenEligible:true}),[]);
 const roundtrip=contentImportReport({schemaVersion:2,id:'export',setName:'Example pool',lane:'TRAINING',industry:'Sales',careerPath:'Account Executive',questions:r.questions});assert.equal(roundtrip.issues.length,0);assert.equal(roundtrip.questions[1].isGoldenEligible,true);assert.equal(roundtrip.questions[1].data.bossEligible,true);
});
test('revised Azure sample has five tiers, supported formats and zero import issues; envelope works',()=>{
 const sample=JSON.parse(fs.readFileSync(require.resolve('../data/content/azure365-v2.json'),'utf8'));const seen=[];
 for(const b of importEnvelope(sample)){const r=contentImportReport(b);assert.equal(r.issues.length,0);for(const q of r.questions){assert.equal(duplicateContentReason(q,seen),'');assert.deepEqual(validateContent(q),[]);seen.push(q);}}
 assert.equal(seen.length,41);assert.deepEqual([...new Set(seen.map(q=>q.difficulty))].sort(),[1,2,3,4,5]);assert.ok(seen.every(q=>['MULTIPLE_CHOICE','TRUE_FALSE','CLI_COMMAND'].includes(q.type)));assert.equal(seen.filter(q=>q.isGoldenEligible).length,2);
});

test('v2 envelope propagates schema version and requires explicit training destinations',()=>{
 const raw={schemaVersion:2,blocks:[{id:'b',setName:'Bank',lane:'TRAINING'}]};
 const [source]=importEnvelope(raw);assert.equal(source.schemaVersion,2);assert.throws(()=>normalizeKnowledgeBlock(source),/industry and careerPath/);
});
