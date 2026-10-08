import { validateQuestionQuality } from './questionQuality';
import type { NormalizedKnowledgeBlock, CandidateQuestion } from './contentEngine';
import { validateContent, contentSignature } from './contentPipeline';
export const GENERATOR_VERSION = '2.1';
const text = (value: any) => String(value ?? '').trim();
export const canonicalContentText = (value: any) => text(value).toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
const strings = (values: any) => Array.isArray(values) ? values.filter(v => typeof v === 'string' && v.trim()).map(text) : [];
const unique = (values: string[]) => [...new Map(values.map(v => [canonicalContentText(v), v])).values()];
function hash(value: string) { let n = 2166136261; for (const c of value) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return (n >>> 0).toString(16); }
function orderChoices(choices: string[], seed: string) { return choices.map((value, index) => ({ value, index, order: hash(seed + value) })).sort((a,b) => a.order.localeCompare(b.order) || a.index-b.index).map(v => v.value); }
function answerText(q: any) {
  const type = text(q.type).toLowerCase();
  if (type === 'multiple_choice') return canonicalContentText((q.choices || q.data?.choices || [])[q.correctIndex ?? q.data?.correctIndex]);
  if (type === 'true_false') return String(q.data?.correctAnswer ?? (q.correctIndex === 0));
  return strings(q.data?.expectedCommands).map(canonicalContentText).sort().join('|');
}
/** Exact/identity duplicates are withheld with reports, never deleted from storage. */
export function duplicateContentReason(candidate: any, existing: any[]) {
  const prompt = canonicalContentText(candidate.prompt), answer = answerText(candidate);
  for (const row of existing) {
    if (contentSignature(candidate) === contentSignature(row)) return 'Exact duplicate question';
    if (canonicalContentText(row.prompt) === prompt && text(row.type).toLowerCase() === text(candidate.type).toLowerCase()) return answerText(row) === answer ? 'Duplicate prompt and answer with different distractors' : 'Conflicting answers for the same prompt; review source truth';
    if (text(row.type).toLowerCase() === text(candidate.type).toLowerCase() && candidate.data?.assessment === 'recall') {
      if (candidate.data.sourceStatement && canonicalContentText(candidate.data.sourceStatement) === canonicalContentText(row.data?.sourceStatement)) return 'Repeated source fact already exists in this pool';
      if (candidate.data.conceptKey && row.data?.term && canonicalContentText(candidate.data.conceptKey) === canonicalContentText(row.data.term)) return 'Repeated recall concept already exists in this pool';
      if (candidate.data.conceptKey && row.data?.assessment === 'recall' && canonicalContentText(candidate.data.conceptKey) === canonicalContentText(row.data.conceptKey) && (candidate.data.sourceSection === 'distractorKnowledge' || row.data.derivedFromWrongAnswer)) return 'Repeated wrong-choice recall concept already exists in this pool';
    }
    if (candidate.data?.generationKey && row.data?.generationKey === candidate.data.generationKey) return 'Repeated learning objective and assessment; review any revised source before replacing';
    if (text(row.type).toLowerCase() !== text(candidate.type).toLowerCase() || answerText(row) !== answer) continue;
    const a = new Set(prompt.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
    const b = new Set(canonicalContentText(row.prompt).split(/[^\p{L}\p{N}]+/u).filter(Boolean));
    const shared = [...a].filter(v => b.has(v)).length;
    if (a.size >= 6 && b.size >= 6 && shared / Math.max(a.size,b.size) >= .9) return 'Near-duplicate prompt and same answer; review before adding';
  }
  return '';
}
export type GenerationIssue = { section: string; row: number; reason: string; payload: any };
export function generateContentReport(block: NormalizedKnowledgeBlock) {
  const source: any = block.contentJson;
  const questions: CandidateQuestion[] = [], issues: GenerationIssue[] = [];
  const report = (section: string, row: number, reason: string, payload: any) => issues.push({ section, row: row + 1, reason, payload });
  const add = (section: string, row: number, item: any, q: any, assessment: string, defaultDifficulty: number, concept?: string) => {
    const difficulty = item.difficulty ?? defaultDifficulty;
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) { report(section,row,'Difficulty must be an integer from 1 to 5',item); return; }
    const evidence = text(item.evidence || item.data?.evidence);
    const constraints = strings(item.constraints || item.data?.constraints);
    const golden = Boolean(item.isGoldenEligible || item.goldenEligible || item.data?.goldenEligible);
    const boss = Boolean(item.bossEligible || item.data?.bossEligible);
    if (['facts','definitions'].includes(section) && difficulty > 2) { report(section,row,'Recall facts and definitions are tiers 1–2. Author a scenario or assessment for higher tiers.',item); return; }
    if (difficulty >= 4 && (!text(item.explanation) || (!evidence && !constraints.length))) { report(section,row,'Tier 4–5 requires authored explanation and evidence or constraints; a hard label alone does not establish difficulty',item); return; }
    if ((golden || boss) && difficulty < 4) { report(section,row,'Golden and Boss eligibility requires authored tier 4–5 content',item); return; }
    if (difficulty >= 4 && !['scenarios','logs'].includes(section)) {
      if (evidence && !q.prompt.includes(evidence)) q.prompt += `\nEvidence: ${evidence}`;
      if (constraints.length && constraints.some(c => !q.prompt.includes(c))) q.prompt += `\nConstraints: ${constraints.join('; ')}`;
    }
    const objective = text(item.objectiveId || item.data?.objectiveId || concept || item.subject || item.term || item.purpose || q.prompt);
    const domainId = text(item.domainId || item.data?.domainId || source.domainId || block.domain).toLowerCase();
    const subdomain = text(item.subdomain || item.data?.subdomain || item.category || source.subdomain || 'general');
    const family = JSON.stringify([source.industry || '',source.careerPath || '',domainId,canonicalContentText(objective),assessment,text(q.type).toLowerCase()]);
    const protectedAnswers = q.type === 'cli_command' ? strings(q.data?.expectedCommands) : q.type === 'multiple_choice' ? [q.choices[q.correctIndex]] : [];
    const hints = strings(item.hints || item.data?.hints || (item.hint ? [item.hint] : [])).filter(hint => !protectedAnswers.some(answer => canonicalContentText(hint).includes(canonicalContentText(answer))));
    if (!hints.length) hints.push(q.type === 'cli_command' ? `Identify the ${text(item.platform) || 'command-line'} tool and the operation required. Check its help for the needed syntax.` : `Compare each option against the task and the stated constraints. Eliminate choices that address a different problem.`);
    q.difficulty = difficulty;
    q.tags = unique([...block.tags,...strings(item.tags),subdomain]);
    q.data = { ...(q.data || {}), generatorVersion: GENERATOR_VERSION, generationKey: family, assessment, conceptKey: canonicalContentText(item.subject || item.term || concept || objective), sourceStatement: text(item.statement || item.definition || item.data?.sourceStatement), objectiveId: objective, sourceBlockId: block.sourceBlockId, sourceSection: section, sourceRow: row + 1, industry: source.industry || null, careerPath: source.careerPath || null, domainId, subdomain, hints, cognitiveLevel: ['recall','understand','apply','diagnose','complex_judgment'][difficulty-1], evidence, constraints, goldenEligible: golden && difficulty >= 4, bossEligible: boss && difficulty >= 4 };
    q.testNowEligible = block.lane === 'TEST_NOW';
    q.data.sourceReferences = strings(item.sourceReferences || item.data?.sourceReferences || source.sourceReferences);
    delete q.distractorKnowledge; // Source authoring stays in the block, not exported gameplay rows.
    q.goldenEligible = golden && difficulty >= 4;
    const errors = [...validateContent({ ...q, isGoldenEligible: q.goldenEligible }), ...validateQuestionQuality(q).issues];
    const duplicate = duplicateContentReason(q,questions);
    if (errors.length || duplicate) report(section,row,errors.join('; ') || duplicate,item);
    else questions.push(q);
  };
  const mcq = (section: string, row: number, item: any, prompt: string, answer: string, distractors: string[], explanation: string, assessment: string, difficulty: number, concept?: string) => {
    const wrong = unique(distractors).filter(v => canonicalContentText(v) !== canonicalContentText(answer));
    if (!answer || wrong.length < 3) { report(section,row,'Provide an explicit answer and three distinct plausible distractors',item); return; }
    const choices = orderChoices([answer,...wrong.slice(0,3)],block.sourceBlockId + prompt);
    add(section,row,item,{prompt,type:'multiple_choice',choices,correctIndex:choices.indexOf(answer),explanation,data:{}},assessment,difficulty,concept);
  };
  block.facts.forEach((item:any,row) => {
    if (!item || typeof item !== 'object') { report('facts',row,'Author a subject, answer, explanation and distractors for this fact',item); return; }
    const requested = strings(item.questionTypes);
    const unsupported = requested.filter(t => !['multiple_choice','true_false','cli_command'].includes(t));
    if (unsupported.length) report('facts',row,`Unsupported requested formats: ${unsupported.join(', ')}. Original source preserved.`,item);
    const subject = text(item.subject), answer = text(item.answer);
    const concept = text(item.objectiveId || subject);
    if (!requested.length || requested.includes('multiple_choice')) {
      if (!text(item.prompt || item.questionHint) && !subject) { report('facts',row,'Provide a subject or a natural question prompt',item); }
      else mcq('facts',row,item,text(item.prompt || item.questionHint) || `Which description best matches ${subject}?`,answer,strings(item.distractors),text(item.explanation || item.statement),'recall',Math.min(2,block.difficulty),concept);
    }
    if (requested.includes('true_false') || typeof item.correctAnswer === 'boolean') {
      if (typeof item.correctAnswer !== 'boolean' || !text(item.claim)) report('facts',row,'True/false requires an authored claim and explicit correctAnswer boolean',item);
      else add('facts',row,item,{prompt:`True or false: ${text(item.claim)}`,type:'true_false',choices:['True','False'],correctIndex:item.correctAnswer?0:1,explanation:text(item.explanation || item.statement),data:{correctAnswer:item.correctAnswer}},'claim',Math.min(2,block.difficulty),concept);
    }
  });
  block.definitions.forEach((item:any,row) => {
    const term=text(item?.term), definition=text(item?.definition);
    const distractors=strings(item?.distractors).length ? strings(item.distractors) : block.definitions.filter((d:any)=>canonicalContentText(d?.term)!==canonicalContentText(term)).map((d:any)=>text(d?.definition));
    mcq('definitions',row,item,`Which description best matches ${term}?`,definition,distractors,text(item?.explanation || `${term}: ${definition}`),'recall',Math.min(2,block.difficulty),term);
  });
  block.commands.forEach((item:any,row) => {
    if (!text(item?.command) || !text(item?.purpose)) { report('commands',row,'Command and precise purpose are required',item); return; }
    if (strings(item.aliases).length && !Array.isArray(item.acceptedCommands)) report('commands',row,'Legacy aliases are not assumed equivalent commands. Use verified acceptedCommands for this exact task.',item);
    add('commands',row,item,{prompt:text(item.prompt) || `Enter the ${text(item.platform) || 'CLI'} command to ${text(item.purpose)}.`,type:'cli_command',explanation:text(item.explanation) || `${text(item.command)} performs this task: ${text(item.purpose)}.`,data:{expectedCommands:unique([text(item.command),...strings(item.acceptedCommands)]),caseSensitive:typeof item.caseSensitive === 'boolean' ? item.caseSensitive : !/powershell|windows/i.test(text(item.platform)),placeholder:'Type the command'}},'command',Math.min(3,block.difficulty),item.objectiveId || item.purpose);
  });
  for (const section of ['scenarios','logs'] as const) block[section].forEach((item:any,row) => {
    const situation=text(item?.scenario || item?.logText || item?.log);
    const answer=text(item?.correctAnswer || item?.answer || item?.bestAction);
    const prompt=text(item?.prompt) || `${situation}\n${text(item?.question) || 'What is the best next action?'}`;
    const evidence=text(item?.evidence);
    const constraints=strings(item?.constraints);
    mcq(section,row,item,[prompt,evidence ? `Evidence: ${evidence}` : '',constraints.length?`Constraints: ${constraints.join('; ')}`:''].filter(Boolean).join('\n'),answer,strings(item?.options).length?strings(item.options):strings(item?.distractors),text(item?.explanation),'scenario:'+canonicalContentText(prompt),Math.max(3,block.difficulty),item?.objectiveId);
  });
  block.procedures.forEach((item:any,row) => {
    if (!text(item?.question || item?.prompt) || !text(item?.answer) || !strings(item?.distractors).length) { report('procedures',row,'Author a supported next-step question with answer and distractors; sequence-order gameplay is not active',item); return; }
    mcq('procedures',row,item,text(item.question || item.prompt),text(item.answer),strings(item.distractors),text(item.explanation),'procedure:'+canonicalContentText(item.question || item.prompt),Math.max(3,block.difficulty),item.objectiveId || item.title);
  });
  block.matching.forEach((item:any,row) => report('matching',row,'Matching gameplay is not active. Convert pairs into authored multiple-choice items with plausible distractors.',item));
  const direct = Array.isArray(source.questions) ? source.questions : [];
  direct.forEach((item:any,row:number) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) { report('questions',row,'Question must be an object',item); return; }
    const type=text(item?.type || 'multiple_choice').toLowerCase();
    const data={...(item?.data || {}),...(item?.expectedCommands ? {expectedCommands:item.expectedCommands} : {}),...(typeof item?.correctAnswer==='boolean'?{correctAnswer:item.correctAnswer}:{})};
    const normalized = type === 'true_false' && typeof data.correctAnswer === 'boolean' ? {...item,choices:['True','False'],correctIndex:data.correctAnswer?0:1} : item;
    add('questions',row,item,{...normalized,type,data},text(item?.assessment || item?.data?.assessment || 'authored:'+canonicalContentText(item?.prompt)),item?.difficulty ?? block.difficulty,item?.objectiveId);
  });
  // Expand only authored knowledge about real incorrect choices. A wrong option is
  // not a statement of truth and must never simply become the next correct answer.
  const parents = questions.slice();
  for (const parent of parents) {
    const section = parent.data.sourceSection;
    const row = parent.data.sourceRow - 1;
    const item = source[section]?.[row];
    const knowledge = item?.distractorKnowledge;
    if (knowledge === undefined) continue;
    if (!Array.isArray(knowledge)) { report(section,row,'distractorKnowledge must be an array of authored wrong-choice concepts',item); continue; }
    knowledge.forEach((entry:any,index:number) => {
      const payload = { parentPrompt: parent.prompt, entry, entryIndex: index + 1 };
      const choice = text(entry?.choice);
      const wrongChoices = parent.type === 'multiple_choice' ? (parent.choices || []).filter((_:string,i:number) => i !== parent.correctIndex) : [];
      if (!choice || !wrongChoices.some((v:string) => canonicalContentText(v) === canonicalContentText(choice))) {
        report('distractorKnowledge',index,'choice must match an incorrect multiple-choice option on an accepted parent question',payload); return;
      }
      if (!text(entry?.definition) || !text(entry?.explanation) || !text(entry?.objectiveId)) {
        report('distractorKnowledge',index,'Provide a verified definition, teaching explanation and stable objectiveId; incorrect options alone are not source facts',payload); return;
      }
      const before = questions.length;
      const difficulty = entry.difficulty ?? Math.min(2,parent.difficulty);
      if (difficulty > 2 && !text(entry.prompt)) { report('distractorKnowledge',index,'Higher-tier follow-ups need an authored application prompt, not a definition recall',payload); return; }
      mcq('distractorKnowledge',index,{...entry,subject:choice,statement:entry.definition,domainId:entry.domainId || parent.data.domainId,subdomain:entry.subdomain || parent.data.subdomain},text(entry.prompt) || `Which description best matches ${choice}?`,text(entry.answer || entry.definition),strings(entry.distractors),text(entry.explanation),difficulty <= 2 ? 'recall' : 'application:'+canonicalContentText(entry.prompt),difficulty,entry.objectiveId);
      if (questions.length > before) questions[questions.length-1].data = {...questions[questions.length-1].data,derivedFromWrongAnswer:true,parentGenerationKey:parent.data.generationKey,parentObjectiveId:parent.data.objectiveId,sourceChoice:choice};
    });
  }
  return { generatorVersion: GENERATOR_VERSION, questions, issues, summary: { generated: questions.length, issues: issues.length, derivedFromWrongAnswers: questions.filter(q=>q.data.derivedFromWrongAnswer).length, byDifficulty: Object.fromEntries([1,2,3,4,5].map(t=>[t,questions.filter(q=>q.difficulty===t).length])) } };
}
