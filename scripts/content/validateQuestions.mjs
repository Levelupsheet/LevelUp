import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {importEnvelope,contentImportReport,validateContent,duplicateContentReason}=require('./loadGenerator.cjs');
const raw=JSON.parse(fs.readFileSync(process.argv[2] || 'scripts/content/generatedQuestions.json','utf8'));
let count=0;const issues=[];const seen=new Map();
for(const block of importEnvelope(raw)){
 const report=contentImportReport(block);
 issues.push(...report.issues);
 const key=JSON.stringify([block.industry || '',block.careerPath || '',block.setName || '',block.lane || '',block.domain || '']);
 const previous=seen.get(key)||[];
 for(const q of report.questions){const reason=duplicateContentReason(q,previous);issues.push(...validateContent(q));if(reason)issues.push(reason);else previous.push(q);count++;}
 seen.set(key,previous);
}
if(issues.length){console.error(JSON.stringify(issues,null,2));process.exitCode=1;}else console.log(`Validated ${count} supported questions. Ready for Admin import and review.`);
