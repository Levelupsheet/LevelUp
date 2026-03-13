import {
  normalizeQuestionType,
  normalizeText,
  safeArray,
  uniqueSortedNumbers,
  type QuestionData,
  type QuestionType,
} from "@/lib/questionTypes";

export type QuestionChoiceShape = {
  type?: QuestionType;
  correctIndex?: number | null;
  choices?: string[];
  data?: QuestionData | null;
};

export function shuffleArray<T>(input: readonly T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function sampleQuestions<T>(input: readonly T[], count?: number): T[] {
  const shuffled = shuffleArray(input);
  if (!count || count <= 0) return shuffled;
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function shuffleQuestionPayload<T extends QuestionChoiceShape>(question: T): T {
  const type = normalizeQuestionType(question.type);

  if (type === "multiple_choice" || type === "incident") {
    const choices = safeArray<string>(question.choices?.length ? question.choices : (question.data as any)?.choices);
    const correctIndex = Number(
      question.correctIndex ?? (question.data as any)?.correctIndex ?? 0,
    );

    const entries = choices.map((choice, index) => ({
      choice,
      isCorrect: index === correctIndex,
    }));

    const shuffled = shuffleArray(entries);
    const nextCorrectIndex = shuffled.findIndex((entry) => entry.isCorrect);
    const nextChoices = shuffled.map((entry) => entry.choice);
    const nextData = {
      ...((question.data as Record<string, unknown>) || {}),
      choices: nextChoices,
      correctIndex: nextCorrectIndex < 0 ? correctIndex : nextCorrectIndex,
    };

    return {
      ...question,
      choices: nextChoices,
      correctIndex: nextCorrectIndex < 0 ? correctIndex : nextCorrectIndex,
      data: nextData,
    };
  }

  if (type === "multi_select") {
    const choices = safeArray<string>((question.data as any)?.choices);
    const correctIndices = uniqueSortedNumbers((question.data as any)?.correctIndices);
    const entries = choices.map((choice, index) => ({
      choice,
      wasCorrect: correctIndices.includes(index),
    }));
    const shuffled = shuffleArray(entries);
    const nextChoices = shuffled.map((entry) => entry.choice);
    const nextCorrectIndices = shuffled
      .map((entry, index) => (entry.wasCorrect ? index : -1))
      .filter((index) => index >= 0);

    return {
      ...question,
      data: {
        ...((question.data as Record<string, unknown>) || {}),
        choices: nextChoices,
        correctIndices: nextCorrectIndices,
      },
    };
  }

  if (type === "sequence_order") {
    const items = safeArray<string>((question.data as any)?.items);
    const correctOrder = safeArray<string>((question.data as any)?.correctOrder);
    const source = correctOrder.length ? correctOrder : items;
    return {
      ...question,
      data: {
        ...((question.data as Record<string, unknown>) || {}),
        items: shuffleArray(source),
        correctOrder: source,
      },
    };
  }

  return question;
}

export function normalizeDifficultyLevel(value: unknown): 1 | 2 | 3 {
  const n = Number(value);
  if (n >= 3) return 3;
  if (n >= 2) return 2;
  return 1;
}

export function evaluateQuestionAnswer(input: {
  type?: QuestionType;
  prompt?: string;
  correctIndex?: number | null;
  choices?: string[];
  data?: QuestionData | null;
  answer: unknown;
}) {
  const type = normalizeQuestionType(input.type);
  const data = (input.data || {}) as Record<string, unknown>;

  if (type === "multiple_choice" || type === "incident") {
    const selected = Number(input.answer);
    const correctIndex = Number(input.correctIndex ?? data.correctIndex ?? -1);
    return {
      correct: selected === correctIndex,
      feedback: selected === correctIndex ? null : "Review the best response and try again.",
    };
  }

  if (type === "fill_blank") {
    const caseSensitive = Boolean(data.caseSensitive);
    const acceptable = safeArray<string>(data.answers).map((value) => normalizeText(value, caseSensitive));
    const guess = normalizeText(input.answer, caseSensitive);
    return {
      correct: Boolean(guess) && acceptable.includes(guess),
      feedback: acceptable.length ? `Accepted answer: ${safeArray<string>(data.answers)[0]}` : "Check the expected term and try again.",
    };
  }

  if (type === "sequence_order") {
    const answerItems = safeArray<string>(input.answer).map((value) => normalizeText(value));
    const correctOrderRaw = safeArray<string>(data.correctOrder).length ? safeArray<string>(data.correctOrder) : safeArray<string>(data.items);
    const correctOrder = correctOrderRaw.map((value) => normalizeText(value));
    const correct = answerItems.length === correctOrder.length && answerItems.every((value, index) => value === correctOrder[index]);
    return {
      correct,
      feedback: correct ? null : `Correct order: ${correctOrderRaw.join(" → ")}`,
    };
  }

  if (type === "multi_select") {
    const picked = uniqueSortedNumbers(input.answer);
    const expected = uniqueSortedNumbers(data.correctIndices);
    const correct = picked.length === expected.length && picked.every((value, index) => value === expected[index]);
    return {
      correct,
      feedback: correct ? null : `Correct selections: ${expected.map((n) => n + 1).join(", ")}`,
    };
  }

  if (type === "cli_command") {
    const allowContains = Boolean(data.allowContains);
    const expectedCommands = safeArray<string>(data.expectedCommands);
    const rawAnswer = String(input.answer ?? "").trim();
    const normalizedAnswer = normalizeText(rawAnswer);
    const correct = expectedCommands.some((command) => {
      const normalizedCommand = normalizeText(command);
      return allowContains ? normalizedAnswer.includes(normalizedCommand) : normalizedAnswer === normalizedCommand;
    });
    return {
      correct,
      feedback: expectedCommands.length ? `Expected command: ${expectedCommands[0]}` : "Check the command syntax and try again.",
    };
  }

  return { correct: false, feedback: "Unsupported question type." };
}
