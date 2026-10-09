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

test('authored wrong-choice concepts expand with provenance, stay deterministic and round-trip once',()=>{
 const knowledge={choice:fact.distractors[0],objectiveId:'storage-purpose',definition:'Maintaining stored information',distractors:['Coordinating customer requests','Scheduling report production','Monitoring identity permissions'],explanation:'Storage administration concerns stored information rather than customer requests.',sourceReferences:['https://example.test/source']};
 const source=block({facts:[{...fact,distractorKnowledge:[knowledge,knowledge,{...knowledge,objectiveId:"another-id-same-concept"}]}]});
 const r=generateContentReport(source);assert.equal(r.questions.length,2);assert.equal(r.summary.derivedFromWrongAnswers,1);assert.equal(r.issues.length,2);assert.ok(r.issues.every(i=>/duplicate|Repeated/i.test(i.reason)));assert.deepEqual(r,generateContentReport(source));
 const follow=r.questions[1];assert.equal(follow.data.derivedFromWrongAnswer,true);assert.equal(follow.data.parentGenerationKey,r.questions[0].data.generationKey);assert.equal(follow.data.sourceChoice,knowledge.choice);assert.equal(follow.choices[follow.correctIndex],knowledge.definition);assert.deepEqual(follow.data.sourceReferences,knowledge.sourceReferences);
 const round=generateContentReport(block({facts:[],questions:r.questions}));assert.equal(round.issues.length,0);assert.equal(round.questions.length,2);assert.equal(round.questions[1].data.derivedFromWrongAnswer,true);
});

test('wrong answers alone, correct options, invalid parents and inflated follow-up tiers cannot create facts',()=>{
 const entries=[{choice:fact.answer,definition:'A verified description',objectiveId:'correct',explanation:'This option is already correct.'},{choice:fact.distractors[0]},{choice:'Not an option',definition:'Some description',objectiveId:'absent',explanation:'This choice is absent.'},{choice:fact.distractors[1],objectiveId:'inflated',definition:'A short definition',explanation:'This is a recall definition.',difficulty:5,distractors:['First alternative','Second alternative','Third alternative']}];
 const r=generateContentReport(block({facts:[{...fact,distractorKnowledge:entries}]}));assert.equal(r.questions.length,1);assert.equal(r.issues.length,4);assert.ok(r.issues.some(i=>i.reason.includes('verified definition')));assert.ok(r.issues.some(i=>i.reason.includes('incorrect')));assert.ok(r.issues.some(i=>i.reason.includes('Higher-tier')));
 const bad=generateContentReport(block({questions:[{prompt:'Broken question',type:'multiple_choice',choices:['One'],correctIndex:0,explanation:'A broken parent.',distractorKnowledge:entries}],facts:[]}));assert.equal(bad.questions.length,0);
});

test('AWS, CNA and Help Desk banks produce 24 unique questions each with all tiers and three concept follow-ups',()=>{
 for(const name of ['aws','cna','helpdesk-technician']){
  const raw=JSON.parse(fs.readFileSync(require.resolve('../data/content/'+name+'-v2.json'),'utf8'));
  const rows=[];for(const b of importEnvelope(raw)){const r=generateContentReport(normalizeKnowledgeBlock(b));assert.deepEqual(r.issues,[],name);assert.equal(r.summary.derivedFromWrongAnswers,3);rows.push(...r.questions);}
  assert.equal(rows.length,24,name);assert.deepEqual([...new Set(rows.map(q=>q.difficulty))].sort(),[1,2,3,4,5]);for(const row of rows)assert.equal(duplicateContentReason(row,rows.filter(q=>q!==row)),'',row.prompt);
  const imported=contentImportReport(importEnvelope(raw)[0]);assert.equal(imported.issues.length,0);assert.equal(imported.questions.length,24);
  const round=generateContentReport(normalizeKnowledgeBlock({...importEnvelope(raw)[0],questions:rows}));assert.equal(round.questions.length,24);assert.equal(round.issues.length,0);
 }
});

test('Security+ conversion accounts for all 90 source entries and imports 115 distinct supported questions',()=>{
 const raw=JSON.parse(fs.readFileSync(require.resolve('../data/content/security-plus-sy0-701-v2.json'),'utf8'));
 const [source]=importEnvelope(raw);assert.equal(source.lane,'CERTIFICATIONS');assert.equal(source.certExam,'SECURITY_PLUS');
 const audit=source.referenceMaterial.conversionAudit;assert.equal(audit.sourceMapping.length,90);assert.deepEqual(audit.sourceMapping.map(x=>x.sourceQuestionNumber),Array.from({length:90},(_,i)=>i+1));
 assert.equal(audit.sourceMapping.filter(x=>x.status==='consolidated').length,1);
 const r=generateContentReport(normalizeKnowledgeBlock(source));assert.deepEqual(r.issues,[]);assert.equal(r.questions.length,115);assert.equal(r.summary.derivedFromWrongAnswers,16);
 assert.deepEqual([...new Set(r.questions.map(q=>q.difficulty))].sort(),[1,2,3,4,5]);
 assert.deepEqual([...new Set(r.questions.map(q=>q.data.domainId))].sort(),[1,2,3,4,5].map(n=>'security-plus-domain-'+n));
 assert.ok(r.questions.every(q=>q.type==='multiple_choice' && q.explanation && q.data.hints.length && !q.goldenEligible && !q.data.bossEligible));
 for(const map of audit.sourceMapping)assert.ok(r.questions.some(q=>q.data.objectiveId===map.targetObjectiveId),JSON.stringify(map));
 for(const row of r.questions)assert.equal(duplicateContentReason(row,r.questions.filter(q=>q!==row)),'',row.prompt);
 assert.equal(new Set(r.questions.map(q=>q.correctIndex)).size,4);
 const round=generateContentReport(normalizeKnowledgeBlock({...source,questions:r.questions}));assert.deepEqual(round.issues,[]);assert.equal(round.questions.length,115);
 const imported=contentImportReport(source);assert.equal(imported.issues.length,0);assert.equal(imported.questions.length,115);
});

test('Test 2 supplements preserve source accounting, route to the intended certification and reimport deterministically',()=>{
 const cases=[['security-plus-sy0-701-test2',90,79,'SECURITY_PLUS','SY0-701'],['azure-az104-test2',80,56,'AZURE','AZ-104']];
 for(const [name,sourceCount,questionCount,certExam,examCode] of cases){
  const raw=JSON.parse(fs.readFileSync(require.resolve('../data/content/'+name+'-v2.json'),'utf8'));
  const [b]=importEnvelope(raw);assert.equal(b.lane,'CERTIFICATIONS');assert.equal(b.certExam,certExam);
  const audit=b.referenceMaterial.conversionAudit;
  const standaloneAudit=JSON.parse(fs.readFileSync(require.resolve('../data/content/'+name+'-conversion-report.json'),'utf8'));
  assert.deepEqual(audit,standaloneAudit);assert.equal(audit.sourceQuestionCount,sourceCount);assert.equal(audit.importQuestionCount,questionCount);
  assert.deepEqual(audit.sourceMapping.map(x=>x.sourceQuestionNumber),Array.from({length:sourceCount},(_,i)=>i+1));
  assert.match(audit.sourceSha256,/^[a-f0-9]{64}$/);
  const generated=generateContentReport(normalizeKnowledgeBlock(b));assert.deepEqual(generated.issues,[]);assert.equal(generated.questions.length,questionCount);
  const imported=contentImportReport(b);assert.deepEqual(imported.issues,[]);assert.equal(imported.questions.length,questionCount);
  assert.deepEqual([...new Set(generated.questions.map(q=>q.difficulty))].sort(),[1,2,3,4,5]);
  assert.ok(generated.questions.every(q=>q.type==='multiple_choice' && q.data.examCode===examCode && q.data.requiresEditorialReview===true && q.explanation && q.data.hints.length && !q.goldenEligible && !q.data.bossEligible));
  for(const q of generated.questions){assert.deepEqual(validateContent(q),[]);assert.equal(duplicateContentReason(q,generated.questions.filter(x=>x!==q)),'',q.prompt);assert.match(duplicateContentReason(q,[q]),/duplicate/i);}
  const roundtrip=generateContentReport(normalizeKnowledgeBlock({...b,questions:generated.questions}));assert.deepEqual(roundtrip.issues,[]);assert.equal(roundtrip.questions.length,questionCount);
  for(const row of audit.sourceMapping.filter(x=>x.targetObjectiveId && x.status!=='consolidated-existing'))assert.ok(generated.questions.some(q=>q.data.objectiveId===row.targetObjectiveId),JSON.stringify(row));
  assert.equal(new Set(generated.questions.map(q=>q.correctIndex)).size,4);
 }
});

test('Security+ supplement maps repeated concepts to the earlier bank instead of emitting duplicate assessments',()=>{
 const read=name=>importEnvelope(JSON.parse(fs.readFileSync(require.resolve('../data/content/'+name+'.json'),'utf8')))[0];
 const earlier=contentImportReport(read('security-plus-sy0-701-v2')).questions;
 const source=read('security-plus-sy0-701-test2-v2');const supplement=contentImportReport(source).questions;
 for(const row of source.referenceMaterial.conversionAudit.sourceMapping.filter(x=>x.status==='consolidated-existing'))assert.ok(earlier.some(q=>q.data.objectiveId===row.targetObjectiveId),row.targetObjectiveId);
 for(const q of supplement)assert.equal(duplicateContentReason(q,earlier),'',q.prompt);
 assert.equal(source.referenceMaterial.conversionAudit.sourceMapping.filter(x=>x.status==='consolidated-existing').length,10);
 assert.equal(source.referenceMaterial.conversionAudit.sourceMapping.filter(x=>x.status==='withheld-review').length,1);
});

test('AZ-104 corrects known source errors without guessing missing named machines or routing to AZ-900',()=>{
 const [source]=importEnvelope(JSON.parse(fs.readFileSync(require.resolve('../data/content/azure-az104-test2-v2.json'),'utf8')));
 const rows=contentImportReport(source).questions;const find=topic=>rows.find(q=>q.data.subdomain===topic);
 const answer=q=>q.choices[q.correctIndex];
 assert.equal(answer(find('role-assignment-permission')),'User Access Administrator at the resource-group scope');
 assert.match(answer(find('azcopy-container-endpoint')),/exampleaccount\.blob\.core\.windows\.net/);
 assert.match(answer(find('modern-guest-monitoring')),/Azure Monitor Agent/);
 assert.equal(answer(find('nva-next-hop')),'Virtual appliance');
 assert.match(answer(find('notactions-not-deny')),/not an explicit deny/);
 assert.ok(rows.every(q=>!/(following|below)\s+(table|diagram)|VM-[ABCDE]|\bAZ-900\b/i.test(q.prompt)));
 assert.equal(source.referenceMaterial.conversionAudit.sourceMapping.filter(x=>x.status==='withheld-review').length,11);
});

test('AWS and MD-102 uploads retain complete accounting, supported formats, five tiers and stable certification metadata',()=>{
 for(const [name,exam,count,sourceCount,cert] of [['aws-saa-c03-test1','SAA-C03',60,65,'AWS'],['microsoft-md102-test1','MD-102',32,45,'MD_102']]){
  const [b]=importEnvelope(JSON.parse(fs.readFileSync(require.resolve('../data/content/'+name+'-v2.json'),'utf8')));
  assert.equal(b.lane,'CERTIFICATIONS');assert.equal(b.certExam,cert);
  const audit=b.referenceMaterial.conversionAudit;assert.equal(audit.importQuestionCount,count);assert.deepEqual(audit.sourceMapping.map(r=>r.sourceQuestionNumber),Array.from({length:sourceCount},(_,i)=>i+1));
  assert.deepEqual(audit,JSON.parse(fs.readFileSync(require.resolve('../data/content/'+name+'-conversion-report.json'),'utf8')));
  const r=generateContentReport(normalizeKnowledgeBlock(b));assert.deepEqual(r.issues,[]);assert.equal(r.questions.length,count);assert.deepEqual([...new Set(r.questions.map(q=>q.difficulty))].sort(),[1,2,3,4,5]);
  for(const q of r.questions){assert.equal(q.type,'multiple_choice');assert.equal(q.data.examCode,exam);assert.ok(q.data.hints.length && q.explanation && !q.goldenEligible && !q.data.bossEligible);assert.equal(duplicateContentReason(q,r.questions.filter(other=>other!==q)),'',q.prompt);}
  const imported=contentImportReport(b);assert.deepEqual(imported.issues,[]);assert.equal(imported.questions.length,count);
  const round=generateContentReport(normalizeKnowledgeBlock({...b,questions:r.questions}));assert.deepEqual(round.issues,[]);assert.equal(round.questions.length,count);
  for(const row of audit.sourceMapping.filter(x=>x.targetObjectiveId))assert.ok(r.questions.some(q=>q.data.objectiveId===row.targetObjectiveId),JSON.stringify(row));
 }
});

test('MD-102 corrects contradictory ESP answers and wrong targeting, packaging and prerequisite keys',()=>{
 const [b]=importEnvelope(JSON.parse(fs.readFileSync(require.resolve('../data/content/microsoft-md102-test1-v2.json'),'utf8')));const r=contentImportReport(b);const answer=topic=>{const q=r.questions.find(q=>q.data.subdomain===topic);return q.choices[q.correctIndex];};
 assert.match(answer('esp-diagnostics'),/Enrollment Status Page/);assert.match(answer('chrome-bookmarks'),/app configuration/);assert.match(answer('targeting-versus-scope-tags'),/assignment/);assert.match(answer('win32-preparation'),/Content Prep Tool/);assert.match(answer('win32-dependency-diagnosis'),/dependency/);
 const maps=b.referenceMaterial.conversionAudit.sourceMapping;assert.equal(maps.find(x=>x.sourceQuestionNumber===23).targetObjectiveId,maps.find(x=>x.sourceQuestionNumber===39).targetObjectiveId);assert.equal(maps.filter(x=>x.status==='withheld-retired').length,6);
 const {CertExam}=require('@prisma/client');assert.ok(Object.values(CertExam).includes('MD_102'));
 const {certificationLabel}=require('../src/lib/publishDestinations.ts');assert.equal(certificationLabel('MD_102'),'Microsoft MD-102');
});
