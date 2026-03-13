import type { ContentLane, CertExam, Prisma, QuestionDomain, QuestionType, StartingPosition } from "@prisma/client";

export type KnowledgeBlockInput = {
  id?: string;
  title?: string;
  setName?: string;
  domain?: string;
  lane?: string;
  startingPosition?: string | null;
  certExam?: string | null;
  difficulty?: number;
  stage?: number;
  facts?: any[];
  definitions?: any[];
  procedures?: any[];
  commands?: any[];
  scenarios?: any[];
  distractors?: string[];
  tags?: string[];
  source?: string;
  contentJson?: any;
};

export type NormalizedKnowledgeBlock = {
  sourceBlockId: string;
  title: string;
  setName: string;
  domain: QuestionDomain;
  lane: ContentLane;
  startingPosition: StartingPosition | null;
  certExam: CertExam | null;
  difficulty: number;
  stage: number;
  facts: any[];
  definitions: any[];
  procedures: any[];
  commands: any[];
  scenarios: any[];
  distractors: string[];
  tags: string[];
  source: string | null;
  contentJson: Prisma.JsonObject;
};

export type CandidateQuestion = {
  prompt: string;
  type: Lowercase<QuestionType>;
  difficulty: number;
  explanation: string | null;
  tags: string[];
  data: Record<string, any>;
  choices?: string[] | null;
  correctIndex?: number | null;
};

const LANES = ["TEST_NOW", "TRAINING", "CERTIFICATIONS"] as const;
const STARTING_POSITIONS = ["HELPDESK_SUPPORT", "DESKTOP_TECHNICIAN", "CLOUD_ENGINEER"] as const;
const CERT_EXAMS = ["A_PLUS", "SECURITY_PLUS", "AZ_900"] as const;
const DOMAINS = ["IDENTITY", "NETWORKING", "SECURITY", "COMPUTE", "STORAGE", "AZURE", "AWS", "WINDOWS", "GENERAL"] as const;

function uniqueStrings(values: any[]): string[] {
  return [...new Set((Array.isArray(values) ? values : []).map((v) => String(v).trim()).filter(Boolean))];
}

function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function xpForDifficulty(difficulty: number) {
  return ({ 1: 10, 2: 20, 3: 35, 4: 50, 5: 75 } as Record<number, number>)[difficulty] ?? 10;
}

function timerForDifficulty(difficulty: number) {
  return ({ 1: 25, 2: 30, 3: 35, 4: 40, 5: 45 } as Record<number, number>)[difficulty] ?? 25;
}

function normalizeDomain(input?: string): QuestionDomain {
  const raw = String(input || "NETWORKING").trim().toUpperCase();
  return (DOMAINS as readonly string[]).includes(raw) ? (raw as QuestionDomain) : "NETWORKING";
}

function normalizeLane(input?: string): ContentLane {
  const raw = String(input || "TEST_NOW").trim().toUpperCase();
  return (LANES as readonly string[]).includes(raw) ? (raw as ContentLane) : "TEST_NOW";
}

function normalizeStartingPosition(input?: string | null): StartingPosition | null {
  const raw = String(input || "").trim().toUpperCase();
  return (STARTING_POSITIONS as readonly string[]).includes(raw) ? (raw as StartingPosition) : null;
}

function normalizeCertExam(input?: string | null): CertExam | null {
  const raw = String(input || "").trim().toUpperCase();
  return (CERT_EXAMS as readonly string[]).includes(raw) ? (raw as CertExam) : null;
}

function guessAnswerFromStatement(statement: string): string | undefined {
  const patterns = [
    /^(.*?)\s+uses\s+port\s+(\d+)$/i,
    /^(.*?)\s+is\s+(.*)$/i,
    /^(.*?)\s+means\s+(.*)$/i,
    /^(.*?)\s+stands for\s+(.*)$/i,
    /^(.*?)\s*[:\-]\s*(.*)$/i,
  ];
  for (const p of patterns) {
    const m = statement.match(p);
    if (m) return String(m[2] || "").trim();
  }
  return undefined;
}

function normalizeFact(input: any) {
  if (typeof input === "string") {
    const statement = input.trim();
    return {
      statement,
      answer: guessAnswerFromStatement(statement),
      questionHint: undefined,
      synonyms: [] as string[],
      distractors: [] as string[],
      tags: [] as string[],
    };
  }
  return {
    statement: String(input?.statement || "").trim(),
    answer: input?.answer ? String(input.answer).trim() : guessAnswerFromStatement(String(input?.statement || "")),
    questionHint: input?.questionHint ? String(input.questionHint).trim() : undefined,
    synonyms: uniqueStrings(input?.synonyms || input?.aliases || []),
    distractors: uniqueStrings(input?.distractors || []),
    tags: uniqueStrings(input?.tags || []),
  };
}

function buildPromptFromFact(statement: string, hint?: string) {
  if (hint) return hint;
  const portMatch = statement.match(/^(.*?)\s+uses\s+port\s+(\d+)$/i);
  if (portMatch) return `Which port does ${portMatch[1].trim()} use?`;
  const meansMatch = statement.match(/^(.*?)\s+(?:is|means|stands for)\s+(.*)$/i);
  if (meansMatch) return `What best completes this statement: ${meansMatch[1].trim()} _____ ?`;
  return `Which answer is correct based on this fact: ${statement}`;
}

export function normalizeKnowledgeBlock(input: KnowledgeBlockInput, index = 0): NormalizedKnowledgeBlock {
  const raw = input?.contentJson && typeof input.contentJson === "object" ? { ...input.contentJson, ...input } : input;
  const sourceBlockId = String(raw.id || raw.title || `block-${Date.now()}-${index}`).trim();
  const title = String(raw.title || raw.setName || sourceBlockId).trim();
  const setName = String(raw.setName || raw.title || sourceBlockId).trim();
  const difficulty = Math.max(1, Math.min(5, Number(raw.difficulty ?? 1) || 1));
  const stage = Math.max(1, Number(raw.stage ?? 1) || 1);
  const contentJson = {
    id: sourceBlockId,
    title,
    setName,
    domain: raw.domain || "NETWORKING",
    lane: raw.lane || "TEST_NOW",
    startingPosition: raw.startingPosition || null,
    certExam: raw.certExam || null,
    difficulty,
    stage,
    facts: Array.isArray(raw.facts) ? raw.facts : [],
    definitions: Array.isArray(raw.definitions) ? raw.definitions : [],
    procedures: Array.isArray(raw.procedures) ? raw.procedures : [],
    commands: Array.isArray(raw.commands) ? raw.commands : [],
    scenarios: Array.isArray(raw.scenarios) ? raw.scenarios : [],
    distractors: uniqueStrings(raw.distractors || []),
    tags: uniqueStrings(raw.tags || []),
    source: raw.source ? String(raw.source) : null,
  } satisfies Prisma.JsonObject;

  return {
    sourceBlockId,
    title,
    setName,
    domain: normalizeDomain(String(raw.domain || "NETWORKING")),
    lane: normalizeLane(String(raw.lane || "TEST_NOW")),
    startingPosition: normalizeStartingPosition(raw.startingPosition),
    certExam: normalizeCertExam(raw.certExam),
    difficulty,
    stage,
    facts: Array.isArray(raw.facts) ? raw.facts : [],
    definitions: Array.isArray(raw.definitions) ? raw.definitions : [],
    procedures: Array.isArray(raw.procedures) ? raw.procedures : [],
    commands: Array.isArray(raw.commands) ? raw.commands : [],
    scenarios: Array.isArray(raw.scenarios) ? raw.scenarios : [],
    distractors: uniqueStrings(raw.distractors || []),
    tags: uniqueStrings(raw.tags || []),
    source: raw.source ? String(raw.source) : null,
    contentJson,
  };
}

function questionTags(block: NormalizedKnowledgeBlock, extra?: string[]) {
  return uniqueStrings([...(block.tags || []), ...(extra || [])]);
}

function toBase(block: NormalizedKnowledgeBlock, difficulty = block.difficulty) {
  return {
    difficulty,
    data: { xp: xpForDifficulty(difficulty), timer: timerForDifficulty(difficulty) },
  };
}

function multipleChoiceFromFact(block: NormalizedKnowledgeBlock, factInput: any): CandidateQuestion | null {
  const fact = normalizeFact(factInput);
  if (!fact.statement || !fact.answer) return null;
  const prompt = buildPromptFromFact(fact.statement, fact.questionHint);
  const distractors = uniqueStrings([...fact.distractors, ...block.distractors]).filter((v) => v !== fact.answer).slice(0, 3);
  if (distractors.length < 1) return null;
  const choices = shuffle([fact.answer, ...distractors]);
  const correctIndex = choices.findIndex((choice) => choice === fact.answer);
  return {
    prompt,
    type: "multiple_choice",
    difficulty: block.difficulty,
    explanation: fact.statement,
    tags: questionTags(block, fact.tags),
    choices,
    correctIndex,
    data: {
      ...toBase(block).data,
      choices,
      correctIndex,
      answer: fact.answer,
      sourceStatement: fact.statement,
    },
  };
}

function fillBlankFromFact(block: NormalizedKnowledgeBlock, factInput: any): CandidateQuestion | null {
  const fact = normalizeFact(factInput);
  if (!fact.statement || !fact.answer) return null;
  return {
    prompt: fact.questionHint || `${fact.statement.replace(String(fact.answer), "____")}`,
    type: "fill_blank",
    difficulty: block.difficulty,
    explanation: fact.statement,
    tags: questionTags(block, fact.tags),
    data: {
      ...toBase(block).data,
      answers: uniqueStrings([fact.answer, ...fact.synonyms]),
      placeholder: "Type your answer",
      caseSensitive: false,
    },
  };
}

function definitionQuestions(block: NormalizedKnowledgeBlock, def: any): CandidateQuestion[] {
  const term = String(def?.term || "").trim();
  const definition = String(def?.definition || "").trim();
  if (!term || !definition) return [];
  const aliases = uniqueStrings(def?.aliases || []);
  const distractors = uniqueStrings([...(def?.distractors || []), ...block.distractors]).filter((v) => v !== term).slice(0, 3);
  const choices = shuffle([term, ...distractors]);
  const correctIndex = choices.findIndex((choice) => choice === term);
  return [
    {
      prompt: `Which term matches this definition: ${definition}`,
      type: "multiple_choice",
      difficulty: block.difficulty,
      explanation: `${term}: ${definition}`,
      tags: questionTags(block, [term]),
      choices,
      correctIndex,
      data: { ...toBase(block).data, choices, correctIndex },
    },
    {
      prompt: `Fill in the blank: ${definition}`,
      type: "fill_blank",
      difficulty: block.difficulty,
      explanation: `${term}: ${definition}`,
      tags: questionTags(block, [term]),
      data: { ...toBase(block).data, answers: uniqueStrings([term, ...aliases]), placeholder: "Type the term", caseSensitive: false },
    },
  ];
}

function procedureQuestion(block: NormalizedKnowledgeBlock, procedure: any): CandidateQuestion | null {
  const steps = uniqueStrings(procedure?.steps || []);
  if (steps.length < 2) return null;
  return {
    prompt: `Put the steps in the correct order for: ${String(procedure?.title || "this procedure")}`,
    type: "sequence_order",
    difficulty: Math.max(2, block.difficulty),
    explanation: procedure?.outcome ? String(procedure.outcome) : null,
    tags: questionTags(block, [String(procedure?.title || "procedure")]),
    data: {
      ...toBase(block, Math.max(2, block.difficulty)).data,
      items: shuffle(steps),
      correctOrder: steps,
    },
  };
}

function commandQuestion(block: NormalizedKnowledgeBlock, command: any): CandidateQuestion | null {
  const cmd = String(command?.command || "").trim();
  const purpose = String(command?.purpose || "").trim();
  if (!cmd || !purpose) return null;
  return {
    prompt: `Enter the command to: ${purpose}`,
    type: "cli_command",
    difficulty: block.difficulty,
    explanation: `Expected command: ${cmd}`,
    tags: questionTags(block, uniqueStrings([command?.platform, ...(command?.tags || [])])),
    data: {
      ...toBase(block).data,
      expectedCommands: uniqueStrings([cmd, ...(command?.aliases || [])]),
      placeholder: "Type command here",
      caseSensitive: false,
    },
  };
}

function scenarioQuestion(block: NormalizedKnowledgeBlock, scenario: any): CandidateQuestion | null {
  const scenarioText = String(scenario?.scenario || "").trim();
  const bestAction = String(scenario?.bestAction || "").trim();
  if (!scenarioText || !bestAction) return null;
  const distractors = uniqueStrings([...(scenario?.distractors || []), ...block.distractors]).filter((v) => v !== bestAction).slice(0, 3);
  const choices = shuffle([bestAction, ...distractors]);
  const correctIndex = choices.findIndex((choice) => choice === bestAction);
  return {
    prompt: "What is the best next action?",
    type: "incident",
    difficulty: Math.max(2, block.difficulty),
    explanation: bestAction,
    tags: questionTags(block, uniqueStrings([scenario?.severity, ...(scenario?.tags || [])])),
    choices,
    correctIndex,
    data: {
      ...toBase(block, Math.max(2, block.difficulty)).data,
      scenario: scenarioText,
      choices,
      correctIndex,
    },
  };
}

function multiSelectQuestion(block: NormalizedKnowledgeBlock): CandidateQuestion | null {
  const choices = uniqueStrings([
    ...block.facts.map((fact) => normalizeFact(fact).statement.split(" ")[0]),
    ...block.definitions.map((def: any) => String(def?.term || "").trim()),
  ]).filter(Boolean).slice(0, 6);
  if (choices.length < 4) return null;
  const preferred = choices.filter((choice) => /secure|https|ssh|ldaps|mfa|security/i.test(choice));
  const correct = preferred.length ? preferred : choices.slice(0, 2);
  const correctIndices = choices.map((choice, index) => (correct.includes(choice) ? index : -1)).filter((index) => index >= 0);
  return {
    prompt: "Select all answers that are most strongly associated with secure access or identity protection in this block.",
    type: "multi_select",
    difficulty: Math.max(2, block.difficulty),
    explanation: "This multi-select is generated from the security-relevant terms in the knowledge block.",
    tags: questionTags(block, ["generated", "multi_select"]),
    data: {
      ...toBase(block, Math.max(2, block.difficulty)).data,
      choices,
      correctIndices,
      minSelections: Math.min(correctIndices.length, 1),
      maxSelections: correctIndices.length,
    },
  };
}

export function generateQuestionsFromBlock(block: NormalizedKnowledgeBlock): CandidateQuestion[] {
  const questions: CandidateQuestion[] = [];
  for (const fact of block.facts) {
    const mc = multipleChoiceFromFact(block, fact);
    if (mc) questions.push(mc);
    const fb = fillBlankFromFact(block, fact);
    if (fb) questions.push(fb);
  }
  for (const def of block.definitions) questions.push(...definitionQuestions(block, def));
  for (const proc of block.procedures) {
    const q = procedureQuestion(block, proc);
    if (q) questions.push(q);
  }
  for (const cmd of block.commands) {
    const q = commandQuestion(block, cmd);
    if (q) questions.push(q);
  }
  for (const scenario of block.scenarios) {
    const q = scenarioQuestion(block, scenario);
    if (q) questions.push(q);
  }
  const multi = multiSelectQuestion(block);
  if (multi) questions.push(multi);
  return questions;
}

export function mapCandidateToDbQuestion(question: CandidateQuestion, sortOrder: number) {
  const type = question.type.toUpperCase() as QuestionType;
  const base = {
    prompt: question.prompt,
    type,
    sortOrder,
    explanation: question.explanation,
    difficulty: question.difficulty,
    tags: question.tags,
    data: question.data,
  };
  if (type === "MULTIPLE_CHOICE" || type === "INCIDENT") {
    return {
      ...base,
      choices: question.choices ?? null,
      correctIndex: question.correctIndex ?? null,
      data: {
        ...question.data,
        choices: question.choices ?? [],
        correctIndex: question.correctIndex ?? -1,
      },
    };
  }
  if (type === "MULTI_SELECT") {
    return {
      ...base,
      choices: Array.isArray(question.data?.choices) ? question.data.choices : null,
      correctIndex: null,
    };
  }
  return { ...base, choices: null, correctIndex: null };
}
