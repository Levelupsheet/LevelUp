/** Infer a destination only when all blocks belong to the same bank. */
export function importDestination(raw: any) {
  const blocks = Array.isArray(raw) ? raw : Array.isArray(raw?.blocks) ? raw.blocks : [raw];
  if (!blocks.length) return null;
  const targets = blocks.map((b: any) => ({
    name: String(b?.setName || ''), lane: String(b?.lane || ''),
    certExam: String(b?.certExam || ''), industry: String(b?.industry || ''),
    careerPath: String(b?.careerPath || ''), domain: String(b?.domain || 'GENERAL'),
  }));
  const first = targets[0];
  if (!first.name || !['TRAINING', 'CERTIFICATIONS', 'TEST_NOW'].includes(first.lane)) return null;
  if (targets.some(t => JSON.stringify(t) !== JSON.stringify(first))) return null;
  return first;
}
