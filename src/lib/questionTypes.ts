export type QuestionType =
  | "multiple_choice"
  | "fill_blank"
  | "sequence_order"
  | "multi_select"
  | "incident"
  | "cli_command";

export type MultipleChoiceData = {
  choices?: string[];
  correctIndex?: number;
};

export type FillBlankData = {
  answers: string[];
  placeholder?: string;
  caseSensitive?: boolean;
};

export type SequenceOrderData = {
  items: string[];
  correctOrder?: string[];
  instructions?: string;
};

export type MultiSelectData = {
  choices: string[];
  correctIndices: number[];
  minSelections?: number;
  maxSelections?: number;
};

export type IncidentData = {
  scenario?: string;
  choices: string[];
  correctIndex: number;
};

export type CliCommandData = {
  expectedCommands: string[];
  placeholder?: string;
  hint?: string;
  allowContains?: boolean;
};

export type QuestionData =
  | MultipleChoiceData
  | FillBlankData
  | SequenceOrderData
  | MultiSelectData
  | IncidentData
  | CliCommandData
  | Record<string, unknown>;

export function normalizeQuestionType(value: unknown): QuestionType {
  const raw = String(value || "multiple_choice").trim().toLowerCase();
  if (
    raw === "multiple_choice" ||
    raw === "fill_blank" ||
    raw === "sequence_order" ||
    raw === "multi_select" ||
    raw === "incident" ||
    raw === "cli_command"
  ) return raw;
  return "multiple_choice";
}

export function normalizeText(value: unknown, caseSensitive = false): string {
  const text = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
  return caseSensitive ? text : text.toLowerCase();
}

export function safeArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function arrayShallowEqual(a: readonly string[], b: readonly string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function uniqueSortedNumbers(input: unknown): number[] {
  const nums = safeArray<number>(input)
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0);
  return [...new Set(nums)].sort((a, b) => a - b);
}
