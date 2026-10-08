const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const ts = require('typescript');
require.extensions['.ts'] = (m,f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{ compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,f);
const { authorQuestion, validateContent, contentSignature, auditContent, learnerEligible } = require('../src/lib/contentPipeline.ts');
const q = { prompt: 'Which command lists directory contents?', type: 'multiple_choice', choices: ['ls','cd'], correctIndex: 0, difficulty: 4, explanation: 'ls lists files in the current directory.' };
test('strict supported formats, true/false and five tiers', () => {
  assert.throws(() => authorQuestion({...q,type:'multi_select'},0),/Unsupported/);
  assert.throws(() => authorQuestion({...q,type:'true_false',correctIndex:undefined},0),/explicit/);
  assert.throws(() => authorQuestion({...q,difficulty:3.4},0),/integer/);
  assert.throws(() => authorQuestion({...q,difficulty:3,isGoldenEligible:true},0),/tier 4/);
  assert.equal(authorQuestion({...q,type:'true_false',correctAnswer:false},0).correctIndex,1);
  assert.deepEqual(validateContent({...q,type:'cli_command',data:{expectedCommands:['ls']}}),[]);
});
test('duplicate detection ignores choice order but respects correct answer', () => {
  assert.equal(contentSignature(q),contentSignature({...q,choices:['cd','ls'],correctIndex:1}));
  assert.notEqual(contentSignature(q),contentSignature({...q,correctIndex:1}));
  const rows = auditContent([{...q,id:'a'},{...q,id:'b'}]); assert.equal(rows[1].review.duplicateOf,'a'); assert.equal(rows.length,2);
});
test('imports require review; invalid and archived content cannot reach learners', () => {
  const row = authorQuestion(q,0); assert.equal(learnerEligible(row),false);
  row.data.reviewStatus='APPROVED'; assert.equal(learnerEligible(row),true);
  row.data.lifecycleStatus='ARCHIVED'; assert.equal(learnerEligible(row),false);
  assert.equal(learnerEligible({...q,difficulty:7}),false);
});
test('malformed legacy answer data remains auditable and low-quality content is flagged',()=>{
 assert.doesNotThrow(()=>auditContent([{...q,id:'bad',choices:{bad:'shape'},data:{expectedCommands:{bad:'shape'}}}]));
 assert.ok(auditContent([{...q,id:'short',explanation:'A works.'}])[0].review.warnings.length>0);
});
