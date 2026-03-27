import fs from "fs";
import path from "path";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { evaluateQuestionAnswer, shuffleQuestionPayload } from "@/lib/questionTransforms";
import { loadActiveBank } from "@/lib/questionBank";
import { normalizeQuestionType } from "@/lib/questionTypes";

export type PvpSubmissionSummary = {
  correctCount: number;
  totalQuestions: number;
  accuracy: number;
  bestStreak: number;
  totalTimeMs: number;
  completedAt: string;
  awardedTokens?: number;
};

export type PvpChallenge = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  lane: string;
  seed: string;
  questionCount: number;
  challenger: { userId: string; displayName: string };
  rival: { userId: string; displayName: string };
  questions: Array<{
    id: string;
    prompt: string;
    type: string;
    choices?: string[];
    data?: Record<string, any>;
    explanation?: string | null;
    internal: {
      correctIndex?: number | null;
      choices?: string[];
      data?: Record<string, any>;
      type: string;
    };
  }>;
  submissions: Record<
    string,
    {
      answers: unknown[];
      summary: PvpSubmissionSummary;
    }
  >;
  winnerUserId?: string | null;
  resultLabel?: string | null;
};

const FILE = path.join(process.cwd(), "data", "pvp-challenges.json");
const SUPPORTED_TYPES = new Set([
  "multiple_choice",
  "incident",
  "true_false",
  "fill_blank",
  "cli_command",
  "multi_select",
]);

function nowIso() {
  return new Date().toISOString();
}

function safeRead(): Record<string, PvpChallenge> {
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function safeWrite(value: Record<string, PvpChallenge>) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(value, null, 2));
}

function sanitizePublicData(data: Record<string, any> | undefined) {
  const clone = { ...(data || {}) };
  delete clone.answers;
  delete clone.correctIndices;
  delete clone.correctAnswer;
  delete clone.correctMatches;
  delete clone.correctOrder;
  delete clone.expectedCommands;
  delete clone.expectedFindings;
  return clone;
}

function seededOrder(seed: string, value: string) {
  return crypto.createHash("sha256").update(`${seed}:${value}`).digest("hex");
}

async function chooseChallengeQuestions(questionCount: number, seed: string) {
  const bank = await loadActiveBank({ lane: "TEST_NOW" });
  const eligible = bank.questions.filter((q: any) => SUPPORTED_TYPES.has(normalizeQuestionType(q?.type)));
  if (!eligible.length) throw new Error("No async PvP questions are available right now.");
  const ordered = [...eligible].sort((a: any, b: any) => seededOrder(seed, String(a.id)).localeCompare(seededOrder(seed, String(b.id))));
  const picked = ordered.slice(0, Math.max(2, Math.min(questionCount, ordered.length)));
  return picked.map((raw: any) => {
    const q = shuffleQuestionPayload(raw as any);
    const normalizedType = normalizeQuestionType(q.type);
    const rawData = q.data && typeof q.data === "object" ? q.data : {};
    return {
      id: String(q.id),
      prompt: String(q.prompt || "Untitled question"),
      type: normalizedType,
      choices: Array.isArray(q.choices)
        ? q.choices
        : Array.isArray(rawData.choices)
          ? rawData.choices
          : undefined,
      data: sanitizePublicData(rawData),
      explanation: typeof q.explanation === "string" ? q.explanation : null,
      internal: {
        correctIndex: typeof q.correctIndex === "number" ? q.correctIndex : null,
        choices: Array.isArray(q.choices)
          ? q.choices
          : Array.isArray(rawData.choices)
            ? rawData.choices
            : undefined,
        data: rawData,
        type: normalizedType,
      },
    };
  });
}

async function lookupDisplayName(userId: string, fallback?: string) {
  const trimmed = String(userId || "").trim();
  if (!trimmed) return fallback || "Unknown";
  try {
    const user = await prisma.user.findUnique({ where: { id: trimmed }, select: { displayName: true } });
    return String(user?.displayName || fallback || trimmed);
  } catch {
    return fallback || trimmed;
  }
}

export function listPvpChallengesForUser(userId: string) {
  const store = safeRead();
  const all = Object.values(store)
    .filter((row) => row.challenger.userId === userId || row.rival.userId === userId)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return {
    incoming: all.filter((row) => row.rival.userId === userId && !row.submissions[userId]),
    outgoing: all.filter((row) => row.challenger.userId === userId && !row.submissions[row.rival.userId]),
    completed: all.filter((row) => row.status === "COMPLETED"),
    all,
  };
}

export function getPvpChallenge(challengeId: string) {
  const store = safeRead();
  return store[String(challengeId || "").trim()] || null;
}

export function toPublicChallenge(challenge: PvpChallenge, userId?: string | null) {
  const trimmed = String(userId || "").trim();
  const you = trimmed && (challenge.challenger.userId === trimmed || challenge.rival.userId === trimmed) ? trimmed : null;
  return {
    id: challenge.id,
    createdAt: challenge.createdAt,
    updatedAt: challenge.updatedAt,
    status: challenge.status,
    lane: challenge.lane,
    seed: challenge.seed,
    questionCount: challenge.questionCount,
    challenger: challenge.challenger,
    rival: challenge.rival,
    questions: challenge.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      type: q.type,
      choices: q.choices,
      data: q.data,
      explanation: q.explanation,
    })),
    you,
    youSubmitted: you ? Boolean(challenge.submissions[you]) : false,
    opponentSubmitted: you ? Boolean(challenge.submissions[challenge.challenger.userId === you ? challenge.rival.userId : challenge.challenger.userId]) : false,
    submissions: Object.fromEntries(
      Object.entries(challenge.submissions).map(([id, row]) => [id, { summary: row.summary }])
    ),
    winnerUserId: challenge.winnerUserId || null,
    resultLabel: challenge.resultLabel || null,
  };
}

export async function createPvpChallenge(input: {
  challengerId: string;
  challengerName?: string;
  rivalId: string;
  rivalName?: string;
  questionCount?: number;
}) {
  const challengerId = String(input.challengerId || "").trim();
  const rivalId = String(input.rivalId || "").trim();
  if (!challengerId || !rivalId) throw new Error("Both challenger and rival are required.");
  if (challengerId === rivalId) throw new Error("Choose another rival.");

  const seed = crypto.randomUUID();
  const questionCount = Math.max(3, Math.min(10, Number(input.questionCount || 6) || 6));
  const [challengerName, rivalName, questions] = await Promise.all([
    lookupDisplayName(challengerId, input.challengerName),
    lookupDisplayName(rivalId, input.rivalName),
    chooseChallengeQuestions(questionCount, seed),
  ]);

  const challenge: PvpChallenge = {
    id: `pvp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    status: "PENDING",
    lane: "TEST_NOW",
    seed,
    questionCount: questions.length,
    challenger: { userId: challengerId, displayName: challengerName },
    rival: { userId: rivalId, displayName: rivalName },
    questions,
    submissions: {},
    winnerUserId: null,
    resultLabel: null,
  };

  const store = safeRead();
  store[challenge.id] = challenge;
  safeWrite(store);
  return challenge;
}

function computeSummary(challenge: PvpChallenge, answers: unknown[], totalTimeMs: number): PvpSubmissionSummary {
  const normalizedAnswers = Array.isArray(answers) ? answers : [];
  let correctCount = 0;
  let currentStreak = 0;
  let bestStreak = 0;

  for (let i = 0; i < challenge.questions.length; i += 1) {
    const question = challenge.questions[i];
    const evaluation = evaluateQuestionAnswer({
      type: question.internal.type as any,
      prompt: question.prompt,
      correctIndex: question.internal.correctIndex,
      choices: question.internal.choices,
      data: question.internal.data,
      answer: normalizedAnswers[i],
    });
    if (evaluation.correct) {
      correctCount += 1;
      currentStreak += 1;
      bestStreak = Math.max(bestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  return {
    correctCount,
    totalQuestions: challenge.questions.length,
    accuracy: challenge.questions.length ? Number((correctCount / challenge.questions.length).toFixed(3)) : 0,
    bestStreak,
    totalTimeMs: Math.max(0, Math.floor(Number(totalTimeMs || 0) || 0)),
    completedAt: nowIso(),
  };
}

async function awardTokens(userId: string, amount: number) {
  if (!userId || amount <= 0) return;
  try {
    await prisma.wallet.upsert({
      where: { userId },
      update: { tokenBalance: { increment: amount } },
      create: { userId, tokenBalance: amount },
    });
  } catch {}
}

function decideWinner(a: PvpSubmissionSummary, b: PvpSubmissionSummary) {
  if (a.accuracy !== b.accuracy) return a.accuracy > b.accuracy ? "A" : "B";
  if (a.totalTimeMs !== b.totalTimeMs) return a.totalTimeMs < b.totalTimeMs ? "A" : "B";
  if (a.bestStreak !== b.bestStreak) return a.bestStreak > b.bestStreak ? "A" : "B";
  return "TIE";
}

export async function submitPvpChallenge(input: {
  challengeId: string;
  userId: string;
  answers: unknown[];
  totalTimeMs: number;
}) {
  const store = safeRead();
  const challenge = store[String(input.challengeId || "").trim()];
  if (!challenge) throw new Error("Challenge not found.");
  const userId = String(input.userId || "").trim();
  if (![challenge.challenger.userId, challenge.rival.userId].includes(userId)) throw new Error("You are not part of this challenge.");
  if (challenge.submissions[userId]) throw new Error("You already submitted this challenge.");

  const summary = computeSummary(challenge, input.answers, input.totalTimeMs);
  challenge.submissions[userId] = {
    answers: Array.isArray(input.answers) ? input.answers : [],
    summary,
  };
  challenge.updatedAt = nowIso();
  challenge.status = Object.keys(challenge.submissions).length >= 2 ? "COMPLETED" : "IN_PROGRESS";

  if (challenge.status === "COMPLETED") {
    const a = challenge.submissions[challenge.challenger.userId]?.summary;
    const b = challenge.submissions[challenge.rival.userId]?.summary;
    if (a && b) {
      const outcome = decideWinner(a, b);
      if (outcome === "A") {
        challenge.winnerUserId = challenge.challenger.userId;
        challenge.resultLabel = `${challenge.challenger.displayName} wins by accuracy/time.`;
        a.awardedTokens = 25;
        b.awardedTokens = 10;
        await Promise.all([awardTokens(challenge.challenger.userId, 25), awardTokens(challenge.rival.userId, 10)]);
      } else if (outcome === "B") {
        challenge.winnerUserId = challenge.rival.userId;
        challenge.resultLabel = `${challenge.rival.displayName} wins by accuracy/time.`;
        a.awardedTokens = 10;
        b.awardedTokens = 25;
        await Promise.all([awardTokens(challenge.challenger.userId, 10), awardTokens(challenge.rival.userId, 25)]);
      } else {
        challenge.winnerUserId = null;
        challenge.resultLabel = "Tie duel • equal accuracy, time, and streak.";
        a.awardedTokens = 15;
        b.awardedTokens = 15;
        await Promise.all([awardTokens(challenge.challenger.userId, 15), awardTokens(challenge.rival.userId, 15)]);
      }
    }
  }

  store[challenge.id] = challenge;
  safeWrite(store);
  return challenge;
}
