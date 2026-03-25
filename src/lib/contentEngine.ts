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
  logs: any[];
  matching: any[];
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
  goldenEligible?: boolean;
  goldenWeight?: number;
  goldenBonusXp?: number;
  testNowEligible?: boolean;
};

const LANES = ["TEST_NOW", "TRAINING", "CERTIFICATIONS", "INTERVIEW"] as const;
const STARTING_POSITIONS = ["HELPDESK_SUPPORT", "DESKTOP_TECHNICIAN", "CLOUD_ENGINEER"] as const;
const CERT_EXAMS = ["A_PLUS", "SECURITY_PLUS", "AZ_900", "AWS", "AZURE"] as const;
const DOMAINS = ["IDENTITY", "NETWORKING", "SECURITY", "COMPUTE", "STORAGE", "AZURE", "AWS", "WINDOWS", "GENERAL"] as const;
const DOMAIN_ALIASES: Record<string, QuestionDomain> = {
  ACTIVE_DIRECTORY: "IDENTITY",
  AD: "IDENTITY",
  IAM: "IDENTITY",
  GROUP_POLICY: "IDENTITY",
  OFFICE365: "GENERAL",
  MICROSOFT_365: "GENERAL",
  O365: "GENERAL",
  PRINTERS: "GENERAL",
  TROUBLESHOOTING: "GENERAL",
  POWERSHELL: "GENERAL",
  IMAGING: "GENERAL",
  MONITORING: "GENERAL",
  VMS: "COMPUTE",
  VM: "COMPUTE",
  A_PLUS: "GENERAL",
  SECURITY_PLUS: "SECURITY",
};

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
function xpForDifficulty(d: number) { return ({ 1: 10, 2: 20, 3: 35, 4: 50, 5: 75 } as Record<number, number>)[d] ?? 10; }
function timerForDifficulty(d: number) { return ({ 1: 25, 2: 30, 3: 35, 4: 40, 5: 45 } as Record<number, number>)[d] ?? 25; }
function normalizeToken(input?: string | null) { return String(input || "").trim().toUpperCase().replace(/[+\-./\s]+/g, "_").replace(/__+/g, "_"); }
function normalizeDomain(input?: string): QuestionDomain { const raw = normalizeToken(input || "NETWORKING"); if ((DOMAINS as readonly string[]).includes(raw)) return raw as QuestionDomain; return DOMAIN_ALIASES[raw] || "GENERAL"; }
function inferLane(raw: any): ContentLane { const direct = normalizeToken(raw?.lane); if (direct === "POSITION_TRAINING") return "TRAINING"; if ((LANES as readonly string[]).includes(direct)) return direct as ContentLane; const hay = normalizeToken([raw?.id, raw?.title, raw?.setName, ...(Array.isArray(raw?.tags) ? raw.tags : [])].join(" ")); if (/CERT|AWS|AZURE|AZ_900|SECURITY_PLUS|A_PLUS/.test(hay)) return "CERTIFICATIONS"; if (/HELPDESK|DESKTOP|CLOUD|POSITION/.test(hay)) return "TRAINING"; return "TEST_NOW"; }
function normalizeStartingPosition(input?: string | null): StartingPosition | null { const raw = normalizeToken(input || ""); return (STARTING_POSITIONS as readonly string[]).includes(raw) ? raw as StartingPosition : null; }
function inferStartingPosition(raw: any, lane: ContentLane): StartingPosition | null { const direct = normalizeStartingPosition(raw?.startingPosition); if (direct) return direct; if (lane !== "TRAINING") return null; const hay = normalizeToken([raw?.id, raw?.title, raw?.setName, raw?.domain, ...(Array.isArray(raw?.tags) ? raw.tags : [])].join(" ")); if (/HELPDESK/.test(hay)) return "HELPDESK_SUPPORT"; if (/DESKTOP/.test(hay)) return "DESKTOP_TECHNICIAN"; if (/CLOUD/.test(hay)) return "CLOUD_ENGINEER"; return null; }
function normalizeCertExam(input?: string | null): CertExam | null { const raw = normalizeToken(input || ""); if (raw === "SECURITY" || raw === "SECURITYPLUS") return "SECURITY_PLUS"; if (raw === "A" || raw === "APLUS") return "A_PLUS"; return (CERT_EXAMS as readonly string[]).includes(raw) ? raw as CertExam : null; }
function inferCertExam(raw: any, lane: ContentLane): CertExam | null { const direct = normalizeCertExam(raw?.certExam); if (direct) return direct; if (lane !== "CERTIFICATIONS") return null; const hay = normalizeToken([raw?.id, raw?.title, raw?.setName, raw?.domain, ...(Array.isArray(raw?.tags) ? raw.tags : [])].join(" ")); if (/AZ_900/.test(hay)) return "AZ_900"; if (/SECURITY_PLUS|SECURITY\+/.test(hay)) return "SECURITY_PLUS"; if (/A_PLUS|A\+/.test(hay)) return "A_PLUS"; if (/AWS/.test(hay)) return "AWS"; if (/AZURE/.test(hay)) return "AZURE"; return null; }
function guessAnswerFromStatement(statement: string) { const patterns = [/^(.*?)\s+uses\s+port\s+(\d+)$/i, /^(.*?)\s+is\s+(.*)$/i, /^(.*?)\s+means\s+(.*)$/i, /^(.*?)\s+stands for\s+(.*)$/i, /^(.*?)\s*[:\-]\s*(.*)$/i]; for (const p of patterns) { const m = statement.match(p); if (m) return String(m[2] || "").trim(); } }

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
      subject: "",
      category: "",
      questionTypes: [] as string[],
    };
  }
  return {
    statement: String(input?.statement || "").trim(),
    answer: input?.answer ? String(input.answer).trim() : guessAnswerFromStatement(String(input?.statement || "")),
    questionHint: input?.questionHint ? String(input.questionHint).trim() : undefined,
    synonyms: uniqueStrings(input?.synonyms || input?.aliases || []),
    distractors: uniqueStrings(input?.distractors || []),
    tags: uniqueStrings(input?.tags || []),
    subject: String(input?.subject || "").trim(),
    category: String(input?.category || "").trim().toLowerCase(),
    questionTypes: uniqueStrings(input?.questionTypes || []).map((v) => v.toLowerCase()),
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

function normalizeChoiceText(value: string) { return String(value || "").trim().toLowerCase(); }
function numericAnswer(answer: string) { const v = String(answer || "").trim(); return /^\d+$/.test(v) ? Number(v) : null; }
function looksLikePortFact(fact: ReturnType<typeof normalizeFact>) { return fact.category === "port" || /\bport\b/i.test(fact.statement) || /uses\s+port\s+\d+/i.test(fact.statement); }
function looksLikeCloudService(answer: string) { return /^(EC2|S3|IAM|LAMBDA|CLOUDWATCH|VPC|RDS|ROUTE53|ROUTE 53|AUTO SCALING|CLOUDTRAIL|AZURE VIRTUAL MACHINES|BLOB STORAGE|AZURE FILES|VIRTUAL NETWORK|ENTRA ID|AZURE MONITOR|KEY VAULT|LOAD BALANCER|FUNCTIONS|APP SERVICE)$/i.test(answer); }
function plausiblePortDistractors(answer: string) {
  const n = numericAnswer(answer);
  const common = [20, 21, 22, 23, 25, 53, 80, 110, 123, 143, 389, 443, 445, 636, 3389];
  return common.filter((v) => v !== n).map(String);
}
function plausibleCloudDistractors(answer: string) {
  const aws = ["EC2", "S3", "IAM", "Lambda", "CloudWatch", "VPC", "RDS", "Route53", "Auto Scaling", "CloudTrail"];
  const azure = ["Azure Virtual Machines", "Azure Blob Storage", "Azure Files", "Azure Virtual Network", "Entra ID", "Azure Monitor", "Key Vault", "Azure Load Balancer", "Azure Functions", "Azure App Service"];
  const source = /azure/i.test(answer) || /entra|vault/i.test(answer) ? azure : aws;
  return source.filter((v) => normalizeChoiceText(v) !== normalizeChoiceText(answer));
}
function plausibleTechnicalDistractors(answer: string, statement: string, block: NormalizedKnowledgeBlock) {
  if (looksLikeCloudService(answer)) return plausibleCloudDistractors(answer);
  if (looksLikePortFact(normalizeFact({ statement, answer }))) return plausiblePortDistractors(answer);
  const glossary = uniqueStrings([
    ...block.definitions.map((d: any) => d?.term),
    ...block.commands.map((c: any) => c?.purpose),
    ...block.facts.map((f: any) => normalizeFact(f).subject || normalizeFact(f).answer),
  ]).filter((v) => normalizeChoiceText(v) !== normalizeChoiceText(answer));
  return glossary;
}
function chooseDistractors(fact: ReturnType<typeof normalizeFact>, block: NormalizedKnowledgeBlock, count = 3) {
  const answer = String(fact.answer || "").trim();
  const pools = [
    uniqueStrings(fact.distractors),
    plausibleTechnicalDistractors(answer, fact.statement, block),
    uniqueStrings(block.distractors).filter((value) => {
      const lower = normalizeChoiceText(value);
      if (!lower || lower === normalizeChoiceText(answer)) return false;
      if (looksLikePortFact(fact)) return /^\d+$/.test(lower);
      return /dns|dhcp|https|http|ssh|rdp|ldap|smtp|s3|ec2|iam|lambda|monitor|vault|vm|storage|policy|group policy|active directory|entra/i.test(lower);
    }),
  ];
  const out: string[] = [];
  for (const pool of pools) {
    for (const candidate of pool) {
      const normalized = normalizeChoiceText(candidate);
      if (!normalized || normalized === normalizeChoiceText(answer)) continue;
      if (out.some((item) => normalizeChoiceText(item) === normalized)) continue;
      out.push(candidate);
      if (out.length >= count) return out;
    }
  }
  return out;
}
function logTextFromCommand(command: any) {
  const purpose = String(command?.purpose || "Command troubleshooting").trim();
  const cmd = String(command?.command || "").trim();
  if (!cmd) return "";
  return [`[host] Running diagnostic command for ${purpose}`, `PS C:\\> ${cmd}`, command?.sampleOutput ? String(command.sampleOutput) : `Output indicates the command returned details related to ${purpose.toLowerCase()}.`].join("\n");
}

export function normalizeKnowledgeBlock(input: KnowledgeBlockInput, index = 0): NormalizedKnowledgeBlock {
  const raw = input?.contentJson && typeof input.contentJson === "object" ? { ...input.contentJson, ...input } : input;
  const sourceBlockId = String(raw.id || raw.title || `block-${Date.now()}-${index}`).trim();
  const title = String(raw.title || raw.setName || sourceBlockId).trim();
  const setName = String(raw.setName || raw.title || sourceBlockId).trim();
  const difficulty = Math.max(1, Math.min(5, Number(raw.difficulty ?? 1) || 1));
  const stage = Math.max(1, Number(raw.stage ?? 1) || 1);
  const lane = inferLane(raw);
  const startingPosition = inferStartingPosition(raw, lane);
  const certExam = inferCertExam(raw, lane);
  const domain = normalizeDomain(String(raw.domain || certExam || (startingPosition ? "GENERAL" : "NETWORKING")));
  const normalizedTags = uniqueStrings([...(Array.isArray(raw.tags) ? raw.tags : []), lane.toLowerCase(), startingPosition ? String(startingPosition).toLowerCase() : "", certExam ? String(certExam).toLowerCase() : "", String(raw.domain || "").toLowerCase()]);
  const contentJson = {
    id: sourceBlockId,
    title,
    setName,
    domain,
    lane,
    startingPosition,
    certExam,
    difficulty,
    stage,
    facts: Array.isArray(raw.facts) ? raw.facts : [],
    definitions: Array.isArray(raw.definitions) ? raw.definitions : [],
    procedures: Array.isArray(raw.procedures) ? raw.procedures : [],
    commands: Array.isArray(raw.commands) ? raw.commands : [],
    scenarios: Array.isArray(raw.scenarios) ? raw.scenarios : [],
    logs: Array.isArray(raw.logs) ? raw.logs : [],
    matching: Array.isArray(raw.matching) ? raw.matching : [],
    distractors: uniqueStrings(raw.distractors || []),
    tags: normalizedTags,
    source: raw.source ? String(raw.source) : null,
  } as any;
  return {
    sourceBlockId,
    title,
    setName,
    domain,
    lane,
    startingPosition,
    certExam,
    difficulty,
    stage,
    facts: Array.isArray(raw.facts) ? raw.facts : [],
    definitions: Array.isArray(raw.definitions) ? raw.definitions : [],
    procedures: Array.isArray(raw.procedures) ? raw.procedures : [],
    commands: Array.isArray(raw.commands) ? raw.commands : [],
    scenarios: Array.isArray(raw.scenarios) ? raw.scenarios : [],
    logs: Array.isArray(raw.logs) ? raw.logs : [],
    matching: Array.isArray(raw.matching) ? raw.matching : [],
    distractors: uniqueStrings(raw.distractors || []),
    tags: normalizedTags,
    source: raw.source ? String(raw.source) : null,
    contentJson,
  };
}

function questionTags(block: NormalizedKnowledgeBlock, extra?: string[]) { return uniqueStrings([...(block.tags || []), ...(extra || [])]); }
function toBase(block: NormalizedKnowledgeBlock, difficulty = block.difficulty) { return { difficulty, data: { xp: xpForDifficulty(difficulty), timer: timerForDifficulty(difficulty) } }; }
function goldenDefaults(block: NormalizedKnowledgeBlock, difficulty = block.difficulty) {
  const testNowEligible = block.lane === "TEST_NOW";
  const isGoldenEligible = testNowEligible && difficulty >= 2;
  return { testNowEligible, goldenEligible: isGoldenEligible, goldenWeight: difficulty >= 3 ? 3 : difficulty >= 2 ? 2 : 1, goldenBonusXp: difficulty >= 3 ? 75 : 50 };
}

function multipleChoiceFromFact(block: NormalizedKnowledgeBlock, factInput: any): CandidateQuestion | null {
  const fact = normalizeFact(factInput);
  if (!fact.statement || !fact.answer) return null;
  const prompt = buildPromptFromFact(fact.statement, fact.questionHint);
  const distractors = chooseDistractors(fact, block, 3);
  if (distractors.length < 3) return null;
  const choices = shuffle([fact.answer, ...distractors.slice(0, 3)]);
  const correctIndex = choices.findIndex((choice) => choice === fact.answer);
  return {
    prompt,
    type: "multiple_choice",
    difficulty: block.difficulty,
    explanation: fact.statement,
    tags: questionTags(block, fact.tags),
    choices,
    correctIndex,
    data: { ...toBase(block).data, choices, correctIndex, answer: fact.answer, sourceStatement: fact.statement },
    ...goldenDefaults(block, block.difficulty),
  };
}
function fillBlankFromFact(block: NormalizedKnowledgeBlock, factInput: any): CandidateQuestion | null {
  const fact = normalizeFact(factInput);
  if (!fact.statement || !fact.answer) return null;
  const masked = fact.statement.includes(String(fact.answer)) ? fact.statement.replace(String(fact.answer), "____") : `${fact.statement} ____`;
  return { prompt: fact.questionHint || masked, type: "fill_blank", difficulty: block.difficulty, explanation: fact.statement, tags: questionTags(block, fact.tags), data: { ...toBase(block).data, answers: uniqueStrings([fact.answer, ...fact.synonyms]), placeholder: "Type your answer", caseSensitive: false }, ...goldenDefaults(block, block.difficulty) };
}
function trueFalseFromFact(block: NormalizedKnowledgeBlock, factInput: any): CandidateQuestion | null {
  const fact = normalizeFact(factInput);
  if (!fact.statement) return null;
  return {
    prompt: `True or false: ${fact.statement}`,
    type: "true_false" as any,
    difficulty: block.difficulty,
    explanation: fact.answer ? `Correct fact: ${fact.statement}` : fact.statement,
    tags: questionTags(block, [...fact.tags, "true_false"]),
    choices: ["True", "False"],
    correctIndex: 0,
    data: { ...toBase(block).data, statement: fact.statement, choices: ["True", "False"], correctIndex: 0, correctAnswer: true },
    ...goldenDefaults(block, block.difficulty),
  };
}
function definitionQuestions(block: NormalizedKnowledgeBlock, def: any): CandidateQuestion[] {
  const term = String(def?.term || "").trim();
  const definition = String(def?.definition || "").trim();
  if (!term || !definition) return [];
  const aliases = uniqueStrings(def?.aliases || []);
  const distractors = uniqueStrings([...(def?.distractors || []), ...plausibleTechnicalDistractors(term, definition, block)]).filter((v) => normalizeChoiceText(v) !== normalizeChoiceText(term)).slice(0, 3);
  if (distractors.length < 3) return [{ prompt: `Fill in the blank: ${definition}`, type: "fill_blank", difficulty: block.difficulty, explanation: `${term}: ${definition}`, tags: questionTags(block, [term]), data: { ...toBase(block).data, answers: uniqueStrings([term, ...aliases]), placeholder: "Type the term", caseSensitive: false }, ...goldenDefaults(block, block.difficulty) }];
  const choices = shuffle([term, ...distractors]);
  const correctIndex = choices.findIndex((choice) => choice === term);
  return [
    { prompt: `Which term matches this definition: ${definition}`, type: "multiple_choice", difficulty: block.difficulty, explanation: `${term}: ${definition}`, tags: questionTags(block, [term]), choices, correctIndex, data: { ...toBase(block).data, choices, correctIndex }, ...goldenDefaults(block, block.difficulty) },
    { prompt: `Fill in the blank: ${definition}`, type: "fill_blank", difficulty: block.difficulty, explanation: `${term}: ${definition}`, tags: questionTags(block, [term]), data: { ...toBase(block).data, answers: uniqueStrings([term, ...aliases]), placeholder: "Type the term", caseSensitive: false }, ...goldenDefaults(block, block.difficulty) },
  ];
}
function procedureQuestion(block: NormalizedKnowledgeBlock, procedure: any): CandidateQuestion | null {
  const steps = uniqueStrings(procedure?.steps || []);
  if (steps.length < 2) return null;
  return { prompt: `Put the steps in the correct order for: ${String(procedure?.title || "this procedure")}`, type: "sequence_order", difficulty: Math.max(2, block.difficulty), explanation: procedure?.outcome ? String(procedure.outcome) : null, tags: questionTags(block, [String(procedure?.title || "procedure")]), data: { ...toBase(block, Math.max(2, block.difficulty)).data, items: shuffle(steps), correctOrder: steps }, ...goldenDefaults(block, Math.max(2, block.difficulty)) };
}
function commandQuestion(block: NormalizedKnowledgeBlock, command: any): CandidateQuestion | null {
  const cmd = String(command?.command || "").trim();
  const purpose = String(command?.purpose || "").trim();
  if (!cmd || !purpose) return null;
  return { prompt: `Enter the command to: ${purpose}`, type: "cli_command", difficulty: block.difficulty, explanation: `Expected command: ${cmd}`, tags: questionTags(block, uniqueStrings([command?.platform, ...(command?.tags || [])])), data: { ...toBase(block).data, expectedCommands: uniqueStrings([cmd, ...(command?.aliases || [])]), placeholder: "Type command here", caseSensitive: false }, ...goldenDefaults(block, block.difficulty) };
}
function logAnalysisQuestion(block: NormalizedKnowledgeBlock, source: any): CandidateQuestion | null {
  const scenarioText = String(source?.scenario || source?.statement || source?.purpose || source?.question || "").trim();
  const bestAction = String(source?.bestAction || source?.answer || source?.correctAnswer || source?.title || source?.purpose || "").trim();
  const logText = source?.logText
    ? String(source.logText)
    : source?.log
      ? String(source.log)
      : source?.command
        ? logTextFromCommand(source)
        : [`[09:15:22] ALERT ${block.title}`, scenarioText || "System generated troubleshooting event.", bestAction ? `Observed clue: ${bestAction}` : "Observed clue: review the failure message."].join("\n");
  if (!logText || !bestAction) return null;
  return { prompt: String(source?.question || "Review the log excerpt and identify the most likely issue or finding."), type: "log_analysis", difficulty: Math.max(2, block.difficulty), explanation: bestAction, tags: questionTags(block, ["log_analysis"]), data: { ...toBase(block, Math.max(2, block.difficulty)).data, logText, answers: uniqueStrings([bestAction, ...(source?.aliases || [])]), expectedFindings: uniqueStrings([bestAction]), placeholder: "Describe the issue shown in the log", caseSensitive: false }, ...goldenDefaults(block, Math.max(2, block.difficulty)) };
}
function scenarioQuestion(block: NormalizedKnowledgeBlock, scenario: any): CandidateQuestion | null {
  const scenarioText = String(scenario?.scenario || "").trim();
  const bestAction = String(scenario?.bestAction || "").trim();
  if (!scenarioText || !bestAction) return null;
  const distractors = uniqueStrings([...(scenario?.distractors || []), ...plausibleTechnicalDistractors(bestAction, scenarioText, block)]).filter((v) => normalizeChoiceText(v) !== normalizeChoiceText(bestAction)).slice(0, 3);
  if (distractors.length < 3) return null;
  const choices = shuffle([bestAction, ...distractors]);
  const correctIndex = choices.findIndex((choice) => choice === bestAction);
  return { prompt: "What is the best next action?", type: "incident", difficulty: Math.max(2, block.difficulty), explanation: bestAction, tags: questionTags(block, uniqueStrings([scenario?.severity, ...(scenario?.tags || [])])), choices, correctIndex, data: { ...toBase(block, Math.max(2, block.difficulty)).data, scenario: scenarioText, choices, correctIndex }, ...goldenDefaults(block, Math.max(2, block.difficulty)) };
}
function multiSelectQuestion(block: NormalizedKnowledgeBlock): CandidateQuestion | null {
  const choices = uniqueStrings([...block.facts.map((fact) => normalizeFact(fact).subject || normalizeFact(fact).answer), ...block.definitions.map((def: any) => String(def?.term || "").trim())]).filter(Boolean).slice(0, 6);
  if (choices.length < 4) return null;
  const preferred = choices.filter((choice) => /secure|https|ssh|ldaps|mfa|security|iam|defender|dns|dhcp/i.test(choice));
  const correct = preferred.length ? preferred.slice(0, Math.min(3, preferred.length)) : choices.slice(0, 2);
  const correctIndices = choices.map((choice, index) => (correct.includes(choice) ? index : -1)).filter((index) => index >= 0);
  return { prompt: "Select all answers that are most strongly associated with secure access, identity, or core service troubleshooting in this block.", type: "multi_select", difficulty: Math.max(2, block.difficulty), explanation: "This multi-select is generated from the most relevant technical terms in the knowledge block.", tags: questionTags(block, ["generated", "multi_select"]), data: { ...toBase(block, Math.max(2, block.difficulty)).data, choices, correctIndices, minSelections: Math.min(correctIndices.length, 1), maxSelections: correctIndices.length }, ...goldenDefaults(block, Math.max(2, block.difficulty)) };
}
function matchingQuestion(block: NormalizedKnowledgeBlock, source: any): CandidateQuestion | null {
  const pairs = uniqueStrings((Array.isArray(source?.pairs) ? source.pairs : []).map((pair: any) => `${String(pair?.left || "").trim()}|||${String(pair?.right || "").trim()}`))
    .map((row) => {
      const [left, right] = row.split("|||");
      return { left, right };
    })
    .filter((pair) => pair.left && pair.right);
  if (pairs.length < 2) return null;
  const leftItems = pairs.map((pair) => pair.left);
  const correctMatches = pairs.map((pair) => pair.right);
  return {
    prompt: String(source?.prompt || "Match each item to the correct value."),
    type: "matching" as any,
    difficulty: Math.max(2, block.difficulty),
    explanation: pairs.map((pair) => `${pair.left}: ${pair.right}`).join(" • "),
    tags: questionTags(block, ["matching"]),
    data: { ...toBase(block, Math.max(2, block.difficulty)).data, pairs, leftItems, rightItems: shuffle(correctMatches), correctMatches },
    ...goldenDefaults(block, Math.max(2, block.difficulty)),
  };
}

export function generateQuestionsFromBlock(block: NormalizedKnowledgeBlock): CandidateQuestion[] {
  const questions: CandidateQuestion[] = [];
  for (const fact of block.facts) {
    const normalizedFact = normalizeFact(fact);
    const allowed = normalizedFact.questionTypes;
    if (!allowed.length || allowed.includes("multiple_choice")) { const mc = multipleChoiceFromFact(block, fact); if (mc) questions.push(mc); }
    if (!allowed.length || allowed.includes("fill_blank")) { const fb = fillBlankFromFact(block, fact); if (fb) questions.push(fb); }
    if (allowed.includes("true_false")) { const tf = trueFalseFromFact(block, fact); if (tf) questions.push(tf); }
    if (!allowed.length || allowed.includes("log_analysis")) { const log = logAnalysisQuestion(block, normalizedFact); if (log) questions.push(log); }
  }
  for (const def of block.definitions) questions.push(...definitionQuestions(block, def));
  for (const proc of block.procedures) { const q = procedureQuestion(block, proc); if (q) questions.push(q); }
  for (const cmd of block.commands) {
    const q = commandQuestion(block, cmd); if (q) questions.push(q);
    const log = logAnalysisQuestion(block, { ...cmd, command: cmd.command, purpose: cmd.purpose }); if (log) questions.push(log);
  }
  for (const scenario of block.scenarios) {
    const q = scenarioQuestion(block, scenario); if (q) questions.push(q);
    const log = logAnalysisQuestion(block, scenario); if (log) questions.push(log);
  }
  for (const entry of block.logs) { const log = logAnalysisQuestion(block, entry); if (log) questions.push(log); }
  for (const entry of block.matching) { const q = matchingQuestion(block, entry); if (q) questions.push(q); }
  const multi = multiSelectQuestion(block); if (multi) questions.push(multi);
  return questions;
}

export function mapCandidateToDbQuestion(question: CandidateQuestion, sortOrder: number) {
  const type = question.type.toUpperCase() as any;
  const base = {
    prompt: question.prompt,
    type,
    sortOrder,
    explanation: question.explanation,
    difficulty: question.difficulty,
    tags: question.tags,
    data: question.data,
    testNowEligible: Boolean(question.testNowEligible),
    isGoldenEligible: Boolean(question.goldenEligible),
    goldenWeight: Number(question.goldenWeight || 1),
    goldenBonusXp: Number(question.goldenBonusXp || 50),
  };
  if (type === "MULTIPLE_CHOICE" || type === "INCIDENT" || type === "TRUE_FALSE") {
    return { ...base, choices: question.choices ?? (Array.isArray((question.data as any)?.choices) ? (question.data as any).choices : null), correctIndex: question.correctIndex ?? ((question.data as any)?.correctIndex ?? null), data: { ...question.data, choices: question.choices ?? ((question.data as any)?.choices ?? []), correctIndex: question.correctIndex ?? ((question.data as any)?.correctIndex ?? -1) } };
  }
  if (type === "MULTI_SELECT") {
    return { ...base, choices: Array.isArray(question.data?.choices) ? question.data.choices : null, correctIndex: null };
  }
  return { ...base, choices: null, correctIndex: null };
}
