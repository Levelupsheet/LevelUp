/** Shared authoring, review and learner eligibility rules. Legacy rows remain intact. */
export const SUPPORTED_FORMATS = ['multiple_choice', 'true_false', 'cli_command'] as const;
export const DIFFICULTY_TIERS = [
  { value: 1, label: 'Recall', description: 'Recognize a foundational fact or term.' },
  { value: 2, label: 'Understanding', description: 'Explain a concept or choose its direct application.' },
  { value: 3, label: 'Application', description: 'Apply knowledge to a realistic single problem.' },
  { value: 4, label: 'Diagnosis', description: 'Analyze evidence and distinguish competing solutions.' },
  { value: 5, label: 'Complex judgment', description: 'Resolve constraints, tradeoffs or multistep problems.' },
];
const text = (v: unknown) => String(v ?? '').trim();
const normalized = (v: unknown) => text(v).toLowerCase().replace(/\s+/g, ' ');
export function validateContent(input: any) {
  const issues: string[] = [];
  const type = text(input?.type || 'multiple_choice').toLowerCase();
  const data = input?.data && typeof input.data === 'object' && !Array.isArray(input.data) ? input.data : {};
  const choices = input?.choices ?? data.choices;
  const index = input?.correctIndex ?? data.correctIndex;
  if (!(SUPPORTED_FORMATS as readonly string[]).includes(type)) issues.push(`Unsupported format: ${type}`);
  if (text(input?.prompt).length < 12) issues.push('Prompt must contain at least 12 characters');
  if (!text(input?.explanation)) issues.push('Explanation is required');
  if (!Number.isInteger(input?.difficulty) || input.difficulty < 1 || input.difficulty > 5) issues.push('Difficulty must be an integer from 1 to 5');
  if (type === 'multiple_choice') {
    if (!Array.isArray(choices) || choices.length < 2 || choices.some((c: any) => typeof c !== 'string' || !c.trim())) issues.push('Provide at least two nonempty answer choices');
    if (!Number.isInteger(index) || index < 0 || index >= (choices?.length || 0)) issues.push('Correct index is invalid');
    if (Array.isArray(choices) && new Set(choices.map(normalized)).size !== choices.length) issues.push('Duplicate answer choices');
  }
  if (type === 'true_false' && typeof (input?.correctAnswer ?? data.correctAnswer) !== 'boolean' && ![0, 1].includes(index)) issues.push('True/false requires an explicit boolean answer or index 0/1');
  if (type === 'cli_command' && (!Array.isArray(data.expectedCommands) || !data.expectedCommands.length || data.expectedCommands.some((c: any) => typeof c !== 'string' || !c.trim()))) issues.push('CLI requires nonempty accepted command strings');
  if (input?.goldenWeight !== undefined && (!Number.isInteger(input.goldenWeight) || input.goldenWeight < 1)) issues.push('Golden weight must be a positive integer');
  if (input?.goldenBonusXp !== undefined && (!Number.isInteger(input.goldenBonusXp) || input.goldenBonusXp < 0)) issues.push('Golden bonus XP must be a nonnegative integer');
  if ((input?.isGoldenEligible || data.bossEligible) && input?.difficulty < 4) issues.push('Golden and Boss questions require tier 4 or 5');
  return issues;
}
export function contentSignature(input: any) {
  const type = normalized(input.type);
  const rawChoices = input.choices ?? input.data?.choices;
  const choices = Array.isArray(rawChoices) ? rawChoices : [];
  const answer = type === 'multiple_choice' ? choices[input.correctIndex ?? input.data?.correctIndex] : type === 'true_false' ? (input.correctAnswer ?? input.data?.correctAnswer ?? ((input.correctIndex ?? input.data?.correctIndex) === 0)) : [...(Array.isArray(input.data?.expectedCommands) ? input.data.expectedCommands : [])].map(normalized).sort();
  return JSON.stringify([normalized(input.prompt), type, [...choices].map(normalized).sort(), typeof answer === 'string' ? normalized(answer) : answer]);
}
export function authorQuestion(input: any, sortOrder: number) {
  const issues = validateContent(input);
  if (issues.length) throw new Error(issues.join('; '));
  const type = text(input.type || 'multiple_choice').toLowerCase();
  const data = { ...(input.data || {}), reviewStatus: 'PENDING', lifecycleStatus: 'ACTIVE' };
  let choices = input.choices ?? data.choices;
  let correctIndex = input.correctIndex ?? data.correctIndex;
  if (type === 'multiple_choice') { data.choices=choices; data.correctIndex=correctIndex; }
  if (type === 'true_false') {
    const answer = input.correctAnswer ?? data.correctAnswer ?? (correctIndex === 0);
    choices = ['True', 'False']; correctIndex = answer ? 0 : 1;
    data.correctAnswer = answer;
  }
  return { prompt: text(input.prompt), type: type.toUpperCase(), choices: type === 'cli_command' ? undefined : choices, correctIndex: type === 'cli_command' ? null : correctIndex, data, explanation: text(input.explanation), difficulty: input.difficulty, subdomain: text(input.subdomain || data.subdomain) || null, tags: Array.isArray(input.tags) ? input.tags.map(text).filter(Boolean) : [], sortOrder, testNowEligible: Boolean(input.testNowEligible), isGoldenEligible: Boolean(input.isGoldenEligible), goldenWeight: Number(input.goldenWeight) || 1, goldenBonusXp: input.goldenBonusXp ?? 50 };
}
export function learnerEligible(q: any) {
  const data = q.data || {};
  return !(data.lifecycleStatus && data.lifecycleStatus !== 'ACTIVE') && !['PENDING', 'REJECTED'].includes(data.reviewStatus) && !validateContent(q).length;
}
export function qualityWarnings(input: any) {
  const warnings: string[] = [];
  if (text(input.prompt).length < 24) warnings.push('Short prompt: check whether enough context is provided');
  if (text(input.explanation).length < 24 || /^the correct answer is\b/i.test(text(input.explanation))) warnings.push('Explanation should teach why the answer works');
  if (/which answer is correct based on this fact|which option best matches this concept/i.test(text(input.prompt))) warnings.push('Generic wording: review educational value');
  if (Array.isArray(input.choices) && /all of the above|none of the above/i.test(input.choices.join(' '))) warnings.push('Review all/none-of-the-above distractors');
  if (input.difficulty >= 4 && text(input.prompt).length < 45) warnings.push('Hard tier: verify that this requires diagnosis or complex judgment');
  return warnings;
}
export function auditContent(rows: any[]) {
  const signatures = new Map<string, string>();
  return rows.map(q => {
    const signature = contentSignature(q);
    const duplicateOf = signatures.get(signature);
    if (!duplicateOf) signatures.set(signature, q.id);
    return { ...q, review: { issues: validateContent(q), warnings: qualityWarnings(q), duplicateOf, eligible: learnerEligible(q) } };
  });
}
