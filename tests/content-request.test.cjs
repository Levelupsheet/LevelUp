const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const ts = require('typescript');
require.extensions['.ts'] = (m,f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const { contentRequest } = require('../src/lib/contentRequest.ts');
const { contentApiError } = require('../src/lib/contentApiError.ts');
const { expandContentImport } = require('../src/lib/contentImport.ts');
test('empty API responses produce actionable errors, not JSON parse exceptions', async()=>{
 const original=global.fetch;
 try {
  global.fetch=async()=>new Response('',{status:500});
  await assert.rejects(contentRequest('/api/admin/questions'),/HTTP 500.*deploy:build/);
  global.fetch=async()=>Response.json({error:'Review questions first'},{status:400});
  await assert.rejects(contentRequest('/api/admin/placements','POST',{}),/Review questions first/);
 } finally { global.fetch=original; }
});
test('schema diagnostics do not disclose database secrets',()=>{
 assert.match(contentApiError({code:'P2021',message:'secret connection'}),/schema is out of date/);
 assert.doesNotMatch(contentApiError(new Error('secret connection')),/secret/);
});
test('knowledge banks expand to supported questions while direct questions remain intact',()=>{
 const bank=JSON.parse(fs.readFileSync(require.resolve('../scripts/content/sampleKnowledgeBlocks.json'),'utf8'));
 const rows=bank.flatMap(expandContentImport);
 assert.ok(rows.length>bank.length);
 assert.ok(rows.every(q=>['MULTIPLE_CHOICE','TRUE_FALSE','CLI_COMMAND'].includes(q.type)));
 const direct={prompt:'Keep this existing question'};
 assert.deepEqual(expandContentImport(direct),[direct]);
});

test('publisher exposes deployed legacy and catalog careers without inventing replacements',()=>{
 const { trainingDestinations, certificationLabel } = require('../src/lib/publishDestinations.ts');
 const rows=trainingDestinations([{industry:'Healthcare',careerPath:'RN'}],[
  {lane:'TRAINING',startingPosition:'HELPDESK_SUPPORT'},
  {lane:'TRAINING',startingPosition:'DESKTOP_TECHNICIAN'},
  {lane:'TRAINING',startingPosition:'CLOUD_ENGINEER'},
  {lane:'TRAINING',industry:'Information Technology',careerPath:'Help Desk'},
  {lane:'CERTIFICATIONS',certExam:'AZ_900'}
 ],[]);
 assert.deepEqual(rows.filter(r=>r.industry==='Information Technology').map(r=>r.careerPath),['Cloud Engineer','Desktop Technician','Help Desk']);
 assert.ok(rows.some(r=>r.careerPath==='RN'));
 assert.equal(certificationLabel('AZ_900'),'Microsoft AZ-900');
});
