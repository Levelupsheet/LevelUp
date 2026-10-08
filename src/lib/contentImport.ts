import { generateContentReport } from './contentGeneration';
import { normalizeKnowledgeBlock, mapCandidateToDbQuestion } from './contentEngine';

/** Both question JSON and knowledge-bank JSON enter the same review workflow. */
export function expandContentImport(raw: any) {
  const source = raw?.contentJson || raw;
  if (!source || source.prompt || !['facts', 'definitions', 'commands', 'procedures', 'scenarios', 'logs', 'matching', 'questions'].some(key => Array.isArray(source[key]))) return [raw];
  const candidates = generateContentReport(normalizeKnowledgeBlock(raw)).questions;
  if (!candidates.length) throw new Error('Knowledge block produced no supported questions. Add answer choices, accepted commands or explicit true/false answers.');
  return candidates.map((q, index) => mapCandidateToDbQuestion(q, index));
}

export function contentImportReport(raw: any) {
  const source = raw?.contentJson || raw;
  if (!source || source.prompt || !['facts','definitions','commands','procedures','scenarios','logs','matching','questions'].some(key => Array.isArray(source[key]))) return { questions: [raw], issues: [] };
  const report = generateContentReport(normalizeKnowledgeBlock(raw));
  return { questions: report.questions.map((q,index) => mapCandidateToDbQuestion(q,index)), issues: report.issues };
}
export function importEnvelope(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.blocks)) return raw.blocks.map((b:any) => b && typeof b === 'object' && !Array.isArray(b) ? {...b,schemaVersion:b.schemaVersion ?? raw.schemaVersion} : b);
  if (Array.isArray(raw?.questions) && !raw.id && !raw.setName && !raw.title) return raw.questions;
  return [raw];
}
