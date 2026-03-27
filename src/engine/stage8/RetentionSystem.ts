
import type { DifficultyTier } from "@/engine/CombatQuizEngine";

export type Stage8QuestionResult = {
  correct: boolean;
  responseTimeMs: number;
  baseTier: DifficultyTier;
};

export type Stage8Momentum = {
  nextRewardIn: number;
  xpBoostActive: boolean;
  xpBoostRemaining: number;
  paceLabel: "warming_up" | "steady" | "accelerating" | "boss_push";
};

export type Stage8Fatigue = {
  fatigued: boolean;
  reason: "slow_responses" | "error_spike" | "mixed" | null;
  suggestion: string | null;
};

export type Stage8Difficulty = {
  adjustedTier: DifficultyTier;
  reason: "boost" | "ease" | "steady";
};

export type Stage8MicroReward = {
  xp: number;
  label: string;
  achievement?: string | null;
};

function clampTier(value: number): DifficultyTier {
  if (value <= 1) return 1;
  if (value >= 3) return 3;
  return value as DifficultyTier;
}

export function getSessionMomentum(args: {
  streak: number;
  currentIndex: number;
  totalQuestions: number;
  xpBoostRemaining: number;
}): Stage8Momentum {
  const { streak, currentIndex, totalQuestions, xpBoostRemaining } = args;
  const nextRewardIn = streak > 0 ? Math.max(1, 3 - (streak % 3 || 3) + 1) : 2;
  const progress = totalQuestions > 0 ? (currentIndex + 1) / totalQuestions : 0;
  const paceLabel =
    progress >= 0.75 ? "boss_push" :
    streak >= 4 ? "accelerating" :
    progress >= 0.25 ? "steady" :
    "warming_up";

  return {
    nextRewardIn,
    xpBoostActive: xpBoostRemaining > 0,
    xpBoostRemaining,
    paceLabel,
  };
}

export function detectFatigue(results: Stage8QuestionResult[]): Stage8Fatigue {
  const recent = results.slice(-4);
  if (!recent.length) return { fatigued: false, reason: null, suggestion: null };

  const wrongCount = recent.filter((entry) => !entry.correct).length;
  const avgMs = recent.reduce((sum, entry) => sum + entry.responseTimeMs, 0) / recent.length;
  const slow = avgMs >= 18000;
  const inaccurate = wrongCount >= 3;

  if (!slow && !inaccurate) return { fatigued: false, reason: null, suggestion: null };

  const reason = slow && inaccurate ? "mixed" : slow ? "slow_responses" : "error_spike";
  const suggestion =
    reason === "slow_responses"
      ? "Taking longer than usual. Dropping the pressure for a question and surfacing support options."
      : reason === "error_spike"
        ? "Accuracy dipped. Easing the next question and nudging a power-up or hint."
        : "Momentum dipped. Easing the next question and recommending support.";

  return { fatigued: true, reason, suggestion };
}

export function getDynamicDifficulty(args: {
  currentTier: DifficultyTier;
  currentQuestionLevel?: DifficultyTier | null;
  fatigue: Stage8Fatigue;
  recentResults: Stage8QuestionResult[];
}): Stage8Difficulty {
  const { currentTier, currentQuestionLevel, fatigue, recentResults } = args;
  const recent = recentResults.slice(-4);
  const base = clampTier(currentQuestionLevel || currentTier || 1);

  if (fatigue.fatigued) {
    return { adjustedTier: clampTier(base - 1), reason: "ease" };
  }

  if (!recent.length) return { adjustedTier: base, reason: "steady" };

  const correctCount = recent.filter((entry) => entry.correct).length;
  const avgMs = recent.reduce((sum, entry) => sum + entry.responseTimeMs, 0) / recent.length;

  if (correctCount >= 3 && avgMs <= 11000) {
    return { adjustedTier: clampTier(base + 1), reason: "boost" };
  }

  if (correctCount <= 1 || avgMs >= 16000) {
    return { adjustedTier: clampTier(base - 1), reason: "ease" };
  }

  return { adjustedTier: base, reason: "steady" };
}

export function getMicroReward(args: {
  streak: number;
  questionIndex: number;
  totalQuestions: number;
  correct: boolean;
}): Stage8MicroReward | null {
  const { streak, questionIndex, totalQuestions, correct } = args;
  if (!correct) return null;

  if (streak > 0 && streak % 3 === 0) {
    return {
      xp: 8,
      label: "Momentum Surge",
      achievement: streak >= 6 ? "Locked-in streak" : "Streak stabilized",
    };
  }

  if (questionIndex + 1 === totalQuestions && totalQuestions > 0) {
    return {
      xp: 5,
      label: "Session Finish",
      achievement: "Strong close",
    };
  }

  if ((questionIndex + 1) % 5 === 0) {
    return {
      xp: 4,
      label: "Checkpoint Bonus",
      achievement: "Mini milestone",
    };
  }

  return null;
}
