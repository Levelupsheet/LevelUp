const fs=require('node:fs');const path=require('node:path');
const {normalizeKnowledgeBlock,generateContentReport,importEnvelope,duplicateContentReason,GENERATOR_VERSION}=require('./loadGenerator.cjs');
const input=path.resolve(process.argv[2] || 'data/content/azure365-v2.json');
const output=path.resolve(process.argv[3] || 'scripts/content/generatedQuestions.json');
const raw=JSON.parse(fs.readFileSync(input,'utf8'));
const seen=new Map();const issues=[];
const blocks=importEnvelope(raw).map((source,index)=>{
 const block=normalizeKnowledgeBlock(source,index);const report=generateContentReport(block);
 const key=JSON.stringify([source.industry || '',source.careerPath || '',block.setName,block.lane,block.domain]);
 const previous=seen.get(key)||[];const questions=[];
 for(const q of report.questions){const reason=duplicateContentReason(q,previous);if(reason)issues.push({blockId:block.sourceBlockId,reason,payload:q});else{previous.push(q);questions.push(q);}}
 seen.set(key,previous);issues.push(...report.issues.map(issue=>({blockId:block.sourceBlockId,...issue})));
 return {schemaVersion:2,id:block.sourceBlockId,title:block.title,setName:block.setName,industry:source.industry,careerPath:source.careerPath,domain:block.domain,domainId:block.contentJson.domainId,lane:block.lane,certExam:block.certExam,referenceMaterial:source.referenceMaterial,difficulty:block.difficulty,questions};
});
fs.writeFileSync(output,JSON.stringify({schemaVersion:2,generatorVersion:GENERATOR_VERSION,blocks,report:{generated:blocks.reduce((n,b)=>n+b.questions.length,0),issues}},null,2)+'\n');
console.log(`Generated ${blocks.reduce((n,b)=>n+b.questions.length,0)} questions; ${issues.length} preserved review issues -> ${output}`);
