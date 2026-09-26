
import type { CombatQuestion } from "@/engine/CombatQuizEngine";
import { normalizeQuestionType, safeArray } from "@/lib/questionTypes";

export type HintType = "REMOVE_TWO" | "PARTIAL_EXPLANATION" | "DOMAIN_HINT";

export const HINT_COSTS: Record<HintType, number> = {
  REMOVE_TWO: 5,
  PARTIAL_EXPLANATION: 10,
  DOMAIN_HINT: 15,
};

export function getHintCost(type: HintType) {
  return HINT_COSTS[type] || 0;
}

export function partialExplanation(text?: string | null, protectedAnswers: string[] = []) {
  const source = String(text || "").trim();
  const fallback = "Focus on the question's core concept, recall its purpose, and eliminate choices that describe a different technology or function.";
  if (!source) return fallback;

  const normalizedAnswers = protectedAnswers
    .map((value) => String(value || "").trim())
    .filter((value) => value.length >= 2)
    .sort((a, b) => b.length - a.length);

  let sentence = source.split(/(?<=[.!?])\s+/)[0] || source;
  for (const answer of normalizedAnswers) {
    const escaped = answer.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\export function partialExplanation(text?: string | null) {
  const source = String(text || "").trim();
  if (!source) return "Think about the core concept and eliminate the weakest distractors first.";
  const sentence = source.split(/(?<=[.!?])\s+/)[0] || source;
  if (sentence.length <= 90) return sentence;
  return sentence.slice(0, 87).trimEnd() + "…";
}

export function domainHintLabel");
    sentence = sentence.replace(new RegExp(escaped, "ig"), "the key concept");
  }

  const leaked = normalizedAnswers.some((answer) =>
    sentence.toLowerCase().includes(answer.toLowerCase())
  );
  if (leaked || sentence.trim().length < 18) return fallback;
  if (sentence.length <= 110) return sentence;
  return sentence.slice(0, 107).trimEnd() + "…";
}

export function domainHintLabel(domainId?: string | null) {
  const raw = String(domainId || "general").trim().toLowerCase();
  return raw ? raw.replace(/_/g, " ").replace(/\w/g, (m) => m.toUpperCase()) : "General";
}

export function removableIncorrectIndices(question?: CombatQuestion | null) {
  if (!question) return [] as number[];
  const type = normalizeQuestionType(question.type);
  if (type !== "multiple_choice" && type !== "incident") return [] as number[];
  const choices = safeArray<string>(question.choices);
  const correctIndex = typeof question.correctIndex === "number" ? question.correctIndex : -1;
  const incorrect = choices.map((_, idx) => idx).filter((idx) => idx !== correctIndex);
  return incorrect.slice(0, 2);
}
