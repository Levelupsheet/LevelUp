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
    const correctIndex = Number(question.correctIndex ?? (question.data as any)?.correctIndex ?? 0);

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

  if (type === "true_false") {
    const raw = (question.data || {}) as Record<string, unknown>;
    const answer = String(raw.correctAnswer ?? raw.answer ?? (question.correctIndex === 0 ? "true" : "false")).trim().toLowerCase();
    const truthy = answer === "true" || answer === "t" || answer === "yes" || answer === "1";
    const choices = ["True", "False"];
    return {
      ...question,
      choices,
      correctIndex: truthy ? 0 : 1,
      data: {
        ...raw,
        choices,
        correctIndex: truthy ? 0 : 1,
        correctAnswer: truthy,
      },
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

  if (type === "matching") {
    const raw = (question.data || {}) as Record<string, unknown>;
    const pairs = safeArray<any>(raw.pairs)
      .map((pair) => ({ left: String(pair?.left || "").trim(), right: String(pair?.right || "").trim() }))
      .filter((pair) => pair.left && pair.right);
    const leftItems = pairs.map((pair) => pair.left);
    const correctMatches = pairs.map((pair) => pair.right);
    const rightItems = shuffleArray([...new Set(correctMatches)]);
    return {
      ...question,
      data: {
        ...raw,
        pairs,
        leftItems,
        rightItems,
        correctMatches,
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
    const choices = safeArray<string>(input.choices ?? data.choices);
    const selected = typeof input.answer === "number" ? Number(input.answer) : choices.findIndex((choice) => normalizeText(choice) === normalizeText(input.answer));
    const correctIndex = Number(input.correctIndex ?? data.correctIndex ?? -1);
    const correct = selected === correctIndex;
    return {
      correct,
      score: correct ? 1 : 0,
      partialScore: correct ? 1 : 0,
      maxScore: 1,
      feedback: correct ? null : "Review the best response and try again.",
    };
  }

  if (type === "true_false") {
    const raw = String(input.answer ?? "").trim().toLowerCase();
    const picked = raw === "0" ? "true" : raw === "1" ? "false" : raw;
    const expected = String(data.correctAnswer ?? (Number(data.correctIndex ?? input.correctIndex ?? -1) === 0 ? "true" : "false")).trim().toLowerCase();
    const correct = picked === expected || (picked === "true" && expected === "1") || (picked === "false" && expected === "0");
    return {
      correct,
      score: correct ? 1 : 0,
      partialScore: correct ? 1 : 0,
      maxScore: 1,
      feedback: correct ? null : `Correct answer: ${expected === "true" || expected === "1" ? "True" : "False"}`,
    };
  }

  if (type === "fill_blank") {
    const caseSensitive = Boolean(data.caseSensitive);
    const acceptable = safeArray<string>(data.answers).map((value) => normalizeText(value, caseSensitive));
    const guess = normalizeText(input.answer, caseSensitive);
    const correct = Boolean(guess) && acceptable.includes(guess);
    return {
      correct,
      score: correct ? 1 : 0,
      partialScore: correct ? 1 : 0,
      maxScore: 1,
      feedback: acceptable.length ? `Accepted answer: ${safeArray<string>(data.answers)[0]}` : "Check the expected term and try again.",
    };
  }

  if (type === "sequence_order") {
    const answerItems = safeArray<string>(input.answer).map((value) => normalizeText(value));
    const correctOrderRaw = safeArray<string>(data.correctOrder).length ? safeArray<string>(data.correctOrder) : safeArray<string>(data.items);
    const correctOrder = correctOrderRaw.map((value) => normalizeText(value));
    let matches = 0;
    for (let i = 0; i < Math.min(answerItems.length, correctOrder.length); i += 1) {
      if (answerItems[i] === correctOrder[i]) matches += 1;
    }
    const partialScore = correctOrder.length ? Number((matches / correctOrder.length).toFixed(3)) : 0;
    const correct = partialScore === 1;
    return {
      correct,
      score: partialScore,
      partialScore,
      maxScore: 1,
      feedback: correct ? null : `Correct order: ${correctOrderRaw.join(" → ")}`,
    };
  }

  if (type === "multi_select") {
    const picked = uniqueSortedNumbers(input.answer);
    const expected = uniqueSortedNumbers(data.correctIndices);
    const overlap = picked.filter((value) => expected.includes(value)).length;
    const union = Array.from(new Set([...picked, ...expected])).length || 1;
    const partialScore = Number((overlap / union).toFixed(3));
    const correct = picked.length === expected.length && picked.every((value, index) => value === expected[index]);
    return {
      correct,
      score: correct ? 1 : partialScore,
      partialScore: correct ? 1 : partialScore,
      maxScore: 1,
      feedback: correct ? null : `Correct selections: ${expected.map((n) => n + 1).join(", ")}`,
    };
  }

  if (type === "matching") {
    const expected = safeArray<string>(data.correctMatches).map((value) => normalizeText(value));
    const submitted = safeArray<string>(input.answer).map((value) => normalizeText(value));
    let matches = 0;
    for (let i = 0; i < Math.min(submitted.length, expected.length); i += 1) {
      if (submitted[i] === expected[i]) matches += 1;
    }
    const partialScore = expected.length ? Number((matches / expected.length).toFixed(3)) : 0;
    const correct = submitted.length === expected.length && submitted.every((value, index) => value === expected[index]);
    return {
      correct,
      score: correct ? 1 : partialScore,
      partialScore: correct ? 1 : partialScore,
      maxScore: 1,
      feedback: correct ? null : `Correct matches: ${safeArray<any>(data.pairs).map((pair) => `${pair.left} → ${pair.right}`).join(" • ")}`,
    };
  }

  if (type === "cli_command") {
    const allowContains = Boolean(data.allowContains ?? true);
    const expectedCommands = safeArray<string>(data.expectedCommands);
    const rawAnswer = String(input.answer ?? "").trim();
    const normalizedAnswer = normalizeText(rawAnswer);
    const compactAnswer = normalizedAnswer.replace(/\s+/g, " ");
    const exact = expectedCommands.some((command) => {
      const normalizedCommand = normalizeText(command).replace(/\s+/g, " ");
      return allowContains ? compactAnswer.includes(normalizedCommand) || normalizedCommand.includes(compactAnswer) : compactAnswer === normalizedCommand;
    });
    let bestPartial = 0;
    for (const command of expectedCommands) {
      const expectedParts = normalizeText(command).replace(/\s+/g, " ").split(" ").filter(Boolean);
      const answerParts = compactAnswer.split(" ").filter(Boolean);
      if (!expectedParts.length || !answerParts.length) continue;
      const overlap = answerParts.filter((part) => expectedParts.includes(part)).length;
      bestPartial = Math.max(bestPartial, overlap / Math.max(expectedParts.length, answerParts.length));
      if (answerParts[0] && expectedParts[0] && answerParts[0] === expectedParts[0]) bestPartial = Math.max(bestPartial, 0.6);
    }
    const partialScore = exact ? 1 : Number(bestPartial.toFixed(3));
    return {
      correct: exact,
      score: partialScore,
      partialScore,
      maxScore: 1,
      feedback: expectedCommands.length ? `Expected command: ${expectedCommands[0]}` : "Check the command syntax and try again.",
    };
  }

  if (type === "log_analysis") {
    const caseSensitive = Boolean(data.caseSensitive);
    const choices = safeArray<string>(data.choices);
    if (choices.length) {
      const selectedIndex = typeof input.answer === "number" ? Number(input.answer) : choices.findIndex((choice) => normalizeText(choice, caseSensitive) === normalizeText(input.answer, caseSensitive));
      const correctIndex = Number(data.correctIndex ?? input.correctIndex ?? -1);
      const correct = selectedIndex === correctIndex;
      return {
        correct,
        score: correct ? 1 : 0,
        partialScore: correct ? 1 : 0,
        maxScore: 1,
        feedback: correctIndex >= 0 && choices[correctIndex] ? `Correct finding: ${choices[correctIndex]}` : "Review the log details and try again.",
      };
    }
    const acceptable = safeArray<string>(data.answers).length
      ? safeArray<string>(data.answers)
      : safeArray<string>(data.expectedFindings);
    const normalizedExpected = acceptable.map((value) => normalizeText(value, caseSensitive));
    const guess = normalizeText(input.answer, caseSensitive);
    const correct = Boolean(guess) && normalizedExpected.some((value) => guess === value || guess.includes(value) || value.includes(guess));
    const partialScore = correct ? 1 : (Boolean(guess) && normalizedExpected.some((value) => guess.includes(value.split(" ")[0]) || value.includes(guess.split(" ")[0])) ? 0.5 : 0);
    return {
      correct,
      score: partialScore,
      partialScore,
      maxScore: 1,
      feedback: acceptable.length ? `Expected finding: ${acceptable[0]}` : "Review the log details and try again.",
    };
  }

  return { correct: false, score: 0, partialScore: 0, maxScore: 1, feedback: "Unsupported question type." };
}
