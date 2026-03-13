export const QUESTION_TYPES = [
  "multiple_choice",
  "fill_blank",
  "sequence_order",
  "multi_select",
  "incident",
  "cli_command",
];

export const LANES = ["TEST_NOW", "TRAINING", "CERTIFICATIONS"];
export const STARTING_POSITIONS = ["HELPDESK_SUPPORT", "DESKTOP_TECHNICIAN", "CLOUD_ENGINEER"];
export const CERT_EXAMS = ["A_PLUS", "SECURITY_PLUS", "AZ_900"];
export const QUESTION_DOMAINS = ["NETWORKING"];

function fail(message) {
  throw new Error(message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function xpForDifficulty(difficulty) {
  return ({ 1: 10, 2: 20, 3: 35, 4: 50, 5: 75 })[difficulty] ?? 10;
}

export function timerForDifficulty(difficulty) {
  return ({ 1: 25, 2: 30, 3: 35, 4: 40, 5: 45 })[difficulty] ?? 25;
}

export function normalizeDomain(domain) {
  const raw = String(domain || "NETWORKING").trim().toUpperCase();
  return QUESTION_DOMAINS.includes(raw) ? raw : "NETWORKING";
}

export function shuffle(input) {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((v) => String(v).trim()).filter(Boolean))];
}

export function guessAnswerFromStatement(statement) {
  const patterns = [
    /^(.*?)\s+uses\s+port\s+(\d+)$/i,
    /^(.*?)\s+is\s+(.*)$/i,
    /^(.*?)\s+means\s+(.*)$/i,
    /^(.*?)\s+stands for\s+(.*)$/i,
    /^(.*?)\s*[:\-]\s*(.*)$/i,
  ];

  for (const pattern of patterns) {
    const match = statement.match(pattern);
    if (match) return String(match[2] || "").trim();
  }
  return undefined;
}

export function normalizeFact(fact) {
  if (typeof fact === "string") {
    const trimmed = fact.trim();
    return {
      statement: trimmed,
      answer: guessAnswerFromStatement(trimmed),
      questionHint: undefined,
      synonyms: [],
      distractors: [],
      tags: [],
    };
  }
  return {
    statement: String(fact.statement || "").trim(),
    answer: fact.answer ? String(fact.answer).trim() : guessAnswerFromStatement(String(fact.statement || "")),
    questionHint: fact.questionHint ? String(fact.questionHint).trim() : undefined,
    synonyms: uniqueStrings(fact.synonyms),
    distractors: uniqueStrings(fact.distractors),
    tags: uniqueStrings(fact.tags),
  };
}

export function buildPromptFromFact(statement, hint) {
  if (hint) return hint;
  const portMatch = statement.match(/^(.*?)\s+uses\s+port\s+(\d+)$/i);
  if (portMatch) return `Which port does ${portMatch[1].trim()} use?`;

  const meansMatch = statement.match(/^(.*?)\s+(?:is|means|stands for)\s+(.*)$/i);
  if (meansMatch) return `What best completes this statement: ${meansMatch[1].trim()} _____ ?`;

  return `Which answer is correct based on this fact: ${statement}`;
}

export function validateKnowledgeBlock(block, index = 0) {
  if (!isObject(block)) fail(`Knowledge block at index ${index} must be an object.`);
  if (!String(block.id || "").trim()) fail(`Knowledge block at index ${index} requires id.`);
  if (!String(block.setName || "").trim()) fail(`Knowledge block ${block.id} requires setName.`);
  if (!LANES.includes(String(block.lane || "TEST_NOW"))) fail(`Knowledge block ${block.id} has invalid lane.`);
  if (block.startingPosition && !STARTING_POSITIONS.includes(String(block.startingPosition))) fail(`Knowledge block ${block.id} has invalid startingPosition.`);
  if (block.certExam && !CERT_EXAMS.includes(String(block.certExam))) fail(`Knowledge block ${block.id} has invalid certExam.`);
  const difficulty = Number(block.difficulty ?? 1);
  const stage = Number(block.stage ?? 1);
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) fail(`Knowledge block ${block.id} has invalid difficulty.`);
  if (!Number.isInteger(stage) || stage < 1) fail(`Knowledge block ${block.id} has invalid stage.`);

  return {
    id: String(block.id).trim(),
    setName: String(block.setName).trim(),
    domain: String(block.domain || "NETWORKING").trim(),
    lane: String(block.lane || "TEST_NOW"),
    startingPosition: block.startingPosition ? String(block.startingPosition) : undefined,
    certExam: block.certExam ? String(block.certExam) : undefined,
    difficulty,
    stage,
    facts: Array.isArray(block.facts) ? block.facts : [],
    definitions: Array.isArray(block.definitions) ? block.definitions : [],
    procedures: Array.isArray(block.procedures) ? block.procedures : [],
    commands: Array.isArray(block.commands) ? block.commands : [],
    scenarios: Array.isArray(block.scenarios) ? block.scenarios : [],
    distractors: uniqueStrings(block.distractors),
    tags: uniqueStrings(block.tags),
    source: block.source ? String(block.source) : undefined,
  };
}

export function ensureQuestion(question) {
  if (!isObject(question)) fail("Question must be an object.");
  if (!String(question.prompt || "").trim()) fail("Question prompt is required.");
  if (!QUESTION_TYPES.includes(String(question.type || ""))) fail(`Invalid question type: ${question.type}`);
  const difficulty = Number(question.difficulty ?? 1);
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) fail(`Invalid question difficulty for prompt: ${question.prompt}`);
  if (!Array.isArray(question.tags)) fail(`Question tags must be an array for prompt: ${question.prompt}`);
  if (!isObject(question.data)) fail(`Question data must be an object for prompt: ${question.prompt}`);

  const normalized = {
    prompt: String(question.prompt).trim(),
    type: String(question.type),
    difficulty,
    explanation: question.explanation == null ? null : String(question.explanation),
    tags: uniqueStrings(question.tags),
    data: question.data,
    choices: Array.isArray(question.choices) ? question.choices.map((value) => String(value)) : undefined,
    correctIndex: question.correctIndex == null ? undefined : Number(question.correctIndex),
  };

  if ((normalized.type === "multiple_choice" || normalized.type === "incident") && (!normalized.choices || normalized.choices.length < 2 || !Number.isInteger(normalized.correctIndex) || normalized.correctIndex < 0 || normalized.correctIndex >= normalized.choices.length)) {
    fail(`Question ${normalized.prompt} requires choices and a valid correctIndex.`);
  }
  if (normalized.type === "fill_blank") {
    const answers = uniqueStrings(normalized.data.answers);
    if (!answers.length) fail(`Question ${normalized.prompt} requires data.answers.`);
    normalized.data.answers = answers;
  }
  if (normalized.type === "sequence_order") {
    const items = uniqueStrings(normalized.data.items);
    const correctOrder = uniqueStrings(normalized.data.correctOrder);
    if (items.length < 2 || correctOrder.length < 2) fail(`Question ${normalized.prompt} requires ordered items.`);
  }
  if (normalized.type === "multi_select") {
    const choices = uniqueStrings(normalized.data.choices);
    const correctIndices = [...new Set((Array.isArray(normalized.data.correctIndices) ? normalized.data.correctIndices : []).map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0))];
    if (choices.length < 2 || !correctIndices.length) fail(`Question ${normalized.prompt} requires multi-select choices and correctIndices.`);
  }
  if (normalized.type === "cli_command") {
    const expected = uniqueStrings(normalized.data.expectedCommands);
    if (!expected.length) fail(`Question ${normalized.prompt} requires expectedCommands.`);
    normalized.data.expectedCommands = expected;
  }

  return normalized;
}

export function validateGeneratedPayload(payload) {
  if (!isObject(payload)) fail("Generated payload must be an object.");
  if (!Array.isArray(payload.groups)) fail("Generated payload requires groups[].");
  const version = Number(payload.version ?? 0);
  if (!Number.isInteger(version) || version < 1) fail("Generated payload requires a positive version.");
  if (!String(payload.generatedAt || "").trim()) fail("Generated payload requires generatedAt.");

  const groups = payload.groups.map((group, index) => {
    if (!isObject(group)) fail(`Group ${index} must be an object.`);
    if (!String(group.blockId || "").trim()) fail(`Group ${index} requires blockId.`);
    if (!isObject(group.set)) fail(`Group ${group.blockId} requires set.`);
    if (!String(group.set.name || "").trim()) fail(`Group ${group.blockId} requires set.name.`);
    if (!LANES.includes(String(group.set.lane || ""))) fail(`Group ${group.blockId} has invalid set.lane.`);
    const questions = Array.isArray(group.questions) ? group.questions.map(ensureQuestion) : fail(`Group ${group.blockId} requires questions[]`);
    return {
      blockId: String(group.blockId).trim(),
      set: {
        name: String(group.set.name).trim(),
        domain: normalizeDomain(group.set.domain),
        lane: String(group.set.lane),
        startingPosition: group.set.startingPosition ? String(group.set.startingPosition) : undefined,
        certExam: group.set.certExam ? String(group.set.certExam) : undefined,
        stage: Number(group.set.stage ?? 1),
        difficulty: Number(group.set.difficulty ?? 1),
        source: group.set.source ? String(group.set.source) : undefined,
      },
      questions,
    };
  });

  return {
    version,
    generatedAt: String(payload.generatedAt),
    groups,
  };
}
