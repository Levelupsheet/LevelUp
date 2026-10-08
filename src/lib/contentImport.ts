import { generateQuestionsFromBlock, normalizeKnowledgeBlock, mapCandidateToDbQuestion } from './contentEngine';

/** Both question JSON and knowledge-bank JSON enter the same review workflow. */
export function expandContentImport(raw: any) {
  const source = raw?.contentJson || raw;
  if (!source || source.prompt || !['facts', 'definitions', 'commands', 'procedures', 'scenarios', 'logs'].some(key => Array.isArray(source[key]))) return [raw];
  const candidates = generateQuestionsFromBlock(normalizeKnowledgeBlock(raw));
  if (!candidates.length) throw new Error('Knowledge block produced no supported questions. Add answer choices, accepted commands or explicit true/false answers.');
  return candidates.map((q, index) => mapCandidateToDbQuestion(q, index));
}
