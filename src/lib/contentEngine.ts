import { generateContentReport } from "./contentGeneration";
import type { ContentLane, CertExam, Prisma, QuestionDomain, QuestionType, StartingPosition } from "@prisma/client";

export type KnowledgeBlockInput = {
  industry?: string; careerPath?: string; domainId?: string; subdomain?: string; questions?: any[]; schemaVersion?: number;
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
  type: "multiple_choice" | "true_false" | "cli_command";
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
const CERT_EXAMS = ["A_PLUS", "SECURITY_PLUS", "AZ_900", "AWS", "AZURE", "MD_102"] as const;
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
function normalizeToken(input?: string | null) { return String(input || "").trim().toUpperCase().replace(/[+\-./\s]+/g, "_").replace(/__+/g, "_"); }
function normalizeDomain(input?: string): QuestionDomain { const raw = normalizeToken(input || "NETWORKING"); if ((DOMAINS as readonly string[]).includes(raw)) return raw as QuestionDomain; return DOMAIN_ALIASES[raw] || "GENERAL"; }
function inferLane(raw: any): ContentLane { const direct = normalizeToken(raw?.lane); if (direct === "POSITION_TRAINING") return "TRAINING"; if ((LANES as readonly string[]).includes(direct)) return direct as ContentLane; const hay = normalizeToken([raw?.id, raw?.title, raw?.setName, ...(Array.isArray(raw?.tags) ? raw.tags : [])].join(" ")); if (/CERT|AWS|AZURE|AZ_900|SECURITY_PLUS|A_PLUS/.test(hay)) return "CERTIFICATIONS"; if (/HELPDESK|DESKTOP|CLOUD|POSITION/.test(hay)) return "TRAINING"; return "TEST_NOW"; }
function normalizeStartingPosition(input?: string | null): StartingPosition | null { const raw = normalizeToken(input || ""); return (STARTING_POSITIONS as readonly string[]).includes(raw) ? raw as StartingPosition : null; }
function inferStartingPosition(raw: any, lane: ContentLane): StartingPosition | null { const direct = normalizeStartingPosition(raw?.startingPosition); if (direct) return direct; if (lane !== "TRAINING") return null; const hay = normalizeToken([raw?.id, raw?.title, raw?.setName, raw?.domain, ...(Array.isArray(raw?.tags) ? raw.tags : [])].join(" ")); if (/HELPDESK/.test(hay)) return "HELPDESK_SUPPORT"; if (/DESKTOP/.test(hay)) return "DESKTOP_TECHNICIAN"; if (/CLOUD/.test(hay)) return "CLOUD_ENGINEER"; return null; }
function normalizeCertExam(input?: string | null): CertExam | null { const raw = normalizeToken(input || ""); if (raw === "SECURITY" || raw === "SECURITYPLUS") return "SECURITY_PLUS"; if (raw === "A" || raw === "APLUS") return "A_PLUS"; return (CERT_EXAMS as readonly string[]).includes(raw) ? raw as CertExam : null; }
function inferCertExam(raw: any, lane: ContentLane): CertExam | null { const direct = normalizeCertExam(raw?.certExam); if (direct) return direct; if (lane !== "CERTIFICATIONS") return null; const hay = normalizeToken([raw?.id, raw?.title, raw?.setName, raw?.domain, ...(Array.isArray(raw?.tags) ? raw.tags : [])].join(" ")); if (/MD_102/.test(hay)) return "MD_102"; if (/AZ_900/.test(hay)) return "AZ_900"; if (/SECURITY_PLUS|SECURITY\+/.test(hay)) return "SECURITY_PLUS"; if (/A_PLUS|A\+/.test(hay)) return "A_PLUS"; if (/AWS/.test(hay)) return "AWS"; if (/AZURE/.test(hay)) return "AZURE"; return null; }
export function normalizeKnowledgeBlock(input: KnowledgeBlockInput, index = 0): NormalizedKnowledgeBlock {
  const raw = input?.contentJson && typeof input.contentJson === "object" ? { ...input.contentJson, ...input } : input;
  if (raw.schemaVersion === 2 && (!raw.id || !raw.setName || !raw.lane)) throw new Error('Version 2 knowledge blocks require stable id, setName and explicit lane');
  if (raw.schemaVersion === 2 && raw.lane === 'TRAINING' && (!raw.industry || !(raw.careerPath || raw.role))) throw new Error('Version 2 training blocks require industry and careerPath');
  if (raw.schemaVersion === 2 && raw.lane === 'CERTIFICATIONS' && !normalizeCertExam(raw.certExam)) throw new Error('Version 2 certification blocks require a supported certExam');
  if (raw.schemaVersion !== undefined && ![1,2].includes(raw.schemaVersion)) throw new Error('Unsupported knowledge schemaVersion; use version 2');
  if (raw.difficulty !== undefined && (!Number.isInteger(raw.difficulty) || raw.difficulty < 1 || raw.difficulty > 5)) throw new Error('Block difficulty must be an integer from 1 to 5');
  const sourceBlockId = String(raw.id || raw.title || `block-${Date.now()}-${index}`).trim();
  const title = String(raw.title || raw.setName || sourceBlockId).trim();
  const setName = String(raw.setName || raw.title || sourceBlockId).trim();
  const difficulty = Math.max(1, Math.min(5, Number(raw.difficulty ?? 1) || 1));
  const stage = Math.max(1, Number(raw.stage ?? 1) || 1);
  const lane = inferLane(raw);
  const startingPosition = inferStartingPosition(raw, lane);
  const certExam = inferCertExam(raw, lane);
  const domain = normalizeDomain(String(raw.domain || certExam || "GENERAL"));
  const normalizedTags = uniqueStrings([...(Array.isArray(raw.tags) ? raw.tags : []), lane.toLowerCase(), startingPosition ? String(startingPosition).toLowerCase() : "", certExam ? String(certExam).toLowerCase() : "", String(raw.domain || "").toLowerCase()]);
  const { contentJson: previousJson, ...preserved } = raw;
  const contentJson = {
    ...preserved,
    id: sourceBlockId,
    title,
    setName,
    domain,
    domainId: raw.domainId || (raw.domain && !DOMAINS.includes(raw.domain as any) ? String(raw.domain).toLowerCase() : String(domain).toLowerCase()),
    industry: raw.industry || null, careerPath: raw.careerPath || raw.role || null,
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

export function generateQuestionsFromBlock(block: NormalizedKnowledgeBlock): CandidateQuestion[] {
  return generateContentReport(block).questions;
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
    subdomain: question.data?.subdomain || null,
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
