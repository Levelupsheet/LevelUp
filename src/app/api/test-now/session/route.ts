import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureUser } from "@/app/api/_lib/ensureUser";
import { getRequestUserId } from "@/app/api/_lib/authUser";
import {
  normalizeDifficultyLevel,
  sampleQuestions,
  shuffleQuestionPayload,
  type QuestionChoiceShape,
} from "@/lib/questionTransforms";
import { normalizeQuestionType } from "@/lib/questionTypes";

const TEST_NOW_GOLDEN_CHANCE = 0.12;

type SessionQuestionPayload = QuestionChoiceShape & {
  id: string;
  prompt: string;
  explanation?: string | null;
  difficulty: 1 | 2 | 3;
  level: 1 | 2 | 3;
  tags: string[];
  domainId?: string;
  isGoldenEligible: boolean;
  goldenWeight: number;
  testNowEligible: boolean;
  isGolden?: boolean;
  raffleEligible?: boolean;
};

function mapQuestion(q: any): SessionQuestionPayload {
  const rawData = q?.data && typeof q.data === "object" ? q.data : {};
  const choices = Array.isArray(q?.choices)
    ? q.choices
    : Array.isArray((rawData as any)?.choices)
      ? (rawData as any).choices
      : [];

  const correctIndex =
    typeof q?.correctIndex === "number"
      ? q.correctIndex
      : typeof (rawData as any)?.correctIndex === "number"
        ? (rawData as any).correctIndex
        : null;

  return {
    id: String(q.id),
    type: normalizeQuestionType(q.type),
    prompt: String(q.prompt || ""),
    choices,
    correctIndex,
    data: rawData,
    explanation: q.explanation ?? null,
    difficulty: normalizeDifficultyLevel(q.difficulty),
    level: normalizeDifficultyLevel(q.difficulty),
    tags: Array.isArray(q.tags) ? q.tags.map(String) : [],
    domainId:
      Array.isArray(q.tags) && q.tags[0]
        ? String(q.tags[0]).toLowerCase()
        : undefined,
    isGoldenEligible: Boolean(q.isGoldenEligible),
    goldenWeight: Math.max(1, Number(q.goldenWeight ?? 1)),
    testNowEligible:
      typeof q.testNowEligible === "boolean" ? Boolean(q.testNowEligible) : true,
  };
}

function serializeSession(session: any) {
  const questions = (session?.questions || [])
    .sort((a: any, b: any) => a.orderIndex - b.orderIndex)
    .map((q: any) => ({
      ...(q.payloadJson || {}),
      sessionQuestionId: q.id,
      isGolden: Boolean(q.isGolden),
      raffleEligible: Boolean(q.isGolden),
    }));

  return {
    ok: true,
    session: session
      ? {
          id: session.id,
          status: session.status,
          currentIndex: session.currentIndex,
          goldenSpawned: Boolean(session.goldenSpawned),
          questionCount: session.questionCount,
          state: session.stateJson || null,
          createdAt: session.createdAt ?? null,
        }
      : null,
    set: session?.setId ? { id: session.setId } : null,
    questions,
  };
}

async function findActiveSession(userId: string) {
  return (prisma as any).gameSession.findFirst({
    where: { userId, mode: "TEST_NOW", status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    include: { questions: { orderBy: { orderIndex: "asc" } } },
  });
}

function pickWeightedQuestion<T extends SessionQuestionPayload>(items: T[]): T | null {
  if (!items.length) return null;

  const totalWeight = items.reduce(
    (sum, item) => sum + Math.max(1, Number(item.goldenWeight ?? 1)),
    0,
  );

  let roll = Math.random() * totalWeight;
  for (const item of items) {
    roll -= Math.max(1, Number(item.goldenWeight ?? 1));
    if (roll <= 0) return item;
  }

  return items[items.length - 1] ?? null;
}

async function buildNewSession(userId: string, questionCount = 10) {
  const placement = await prisma.questionSetPlacement.findFirst({
    where: { lane: "TEST_NOW", isActive: true },
    orderBy: { createdAt: "desc" },
    include: {
      set: {
        include: {
          questions: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        },
      },
    },
  });

  if (!placement?.set?.questions?.length) {
    throw new Error("No active Test Now question set found");
  }

  const pool: SessionQuestionPayload[] = placement.set.questions.map(mapQuestion);
  const eligiblePool: SessionQuestionPayload[] = pool.filter((q) => q.testNowEligible !== false);

  if (!eligiblePool.length) {
    throw new Error("No eligible Test Now questions found");
  }

  const selectedBase: SessionQuestionPayload[] = sampleQuestions(eligiblePool, questionCount);

  let finalQuestions: SessionQuestionPayload[] = selectedBase.map((q) => {
    const shuffled = shuffleQuestionPayload<SessionQuestionPayload>(q);
    return {
      ...shuffled,
      id: q.id,
      isGolden: false,
      raffleEligible: false,
    };
  });

  let goldenQuestionId: string | null = null;

  const shouldSpawnGolden =
    eligiblePool.some((q) => q.isGoldenEligible) && Math.random() < TEST_NOW_GOLDEN_CHANCE;

  if (shouldSpawnGolden && finalQuestions.length > 0) {
    const selectedIds = new Set(finalQuestions.map((q) => String(q.id)));
    const goldenCandidates: SessionQuestionPayload[] = eligiblePool.filter(
      (q) => q.isGoldenEligible && !selectedIds.has(String(q.id)),
    );

    const pickedGolden: SessionQuestionPayload | null = pickWeightedQuestion(goldenCandidates);

    if (pickedGolden) {
      const replacementIndex = Math.floor(Math.random() * finalQuestions.length);
      const shuffledGolden = shuffleQuestionPayload<SessionQuestionPayload>(pickedGolden);

      goldenQuestionId = String(pickedGolden.id);
      finalQuestions[replacementIndex] = {
        ...shuffledGolden,
        id: pickedGolden.id,
        isGolden: true,
        raffleEligible: true,
      };
    }
  }

  const initialState = {
    idx: 0,
    playerHP: 100,
    enemyHP: 100,
    correctCount: 0,
    xpEarned: 0,
    tier: 1,
    mastery: {},
    timeLeft: 25,
    lastWasCorrect: null,
    feedback: null,
    locked: false,
    selected: null,
    finished: false,
  };

  const session = await prisma.$transaction(async (tx: any) => {
    const created = await tx.gameSession.create({
      data: {
        userId,
        mode: "TEST_NOW",
        status: "ACTIVE",
        placementId: placement.id,
        setId: placement.set.id,
        questionCount: finalQuestions.length,
        goldenSpawned: Boolean(goldenQuestionId),
        currentIndex: 0,
        stateJson: initialState,
      },
    });

    for (let i = 0; i < finalQuestions.length; i += 1) {
      const q = finalQuestions[i];
      await tx.gameSessionQuestion.create({
        data: {
          sessionId: created.id,
          questionId: q.id ? String(q.id) : null,
          orderIndex: i,
          payloadJson: q,
          isGolden: String(q.id) === goldenQuestionId,
        },
      });
    }

    return tx.gameSession.findUnique({
      where: { id: created.id },
      include: { questions: { orderBy: { orderIndex: "asc" } } },
    });
  });

  return session;
}

export async function GET(req: Request) {
  try {
    const userId = String((await getRequestUserId(req)) || "").trim();
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const session = await findActiveSession(userId);
    if (!session) {
      return NextResponse.json({ ok: true, session: null, questions: [] });
    }

    return NextResponse.json(serializeSession(session));
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load Test Now session" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const userId = String(body?.userId || (await getRequestUserId(req)) || "").trim();
    const questionCount = Math.max(1, Math.min(25, Number(body?.questionCount || 10) || 10));

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    await ensureUser(userId);

    const existing = await findActiveSession(userId);
    if (existing) {
      return NextResponse.json(serializeSession(existing));
    }

    const session = await buildNewSession(userId, questionCount);
    return NextResponse.json(serializeSession(session));
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to create Test Now session" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const sessionId = String(body?.sessionId || "").trim();
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    const currentIndex = Number(body?.currentIndex);
    const state = body?.state && typeof body.state === "object" ? body.state : undefined;
    const status = typeof body?.status === "string" ? String(body.status).toUpperCase() : undefined;
    const answered = Array.isArray(body?.answeredQuestions) ? body.answeredQuestions : [];

    await prisma.$transaction(async (tx: any) => {
      if (answered.length) {
        for (const row of answered) {
          const sessionQuestionId = String(row?.sessionQuestionId || "").trim();
          if (!sessionQuestionId) continue;

          await tx.gameSessionQuestion.update({
            where: { id: sessionQuestionId },
            data: {
              answered: true,
              isCorrect: typeof row?.isCorrect === "boolean" ? row.isCorrect : null,
              selectedAnswer: row?.selectedAnswer == null ? null : String(row.selectedAnswer),
              answeredAt: new Date(),
            },
          });
        }
      }

      await tx.gameSession.update({
        where: { id: sessionId },
        data: {
          currentIndex: Number.isFinite(currentIndex) ? Math.max(0, currentIndex) : undefined,
          stateJson: state,
          status:
            status === "COMPLETED"
              ? "COMPLETED"
              : status === "ABANDONED"
                ? "ABANDONED"
                : undefined,
          completedAt: status === "COMPLETED" ? new Date() : undefined,
        },
      });
    });

    const session = await (prisma as any).gameSession.findUnique({
      where: { id: sessionId },
      include: { questions: { orderBy: { orderIndex: "asc" } } },
    });

    return NextResponse.json(serializeSession(session));
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to update Test Now session" },
      { status: 500 },
    );
  }
}
