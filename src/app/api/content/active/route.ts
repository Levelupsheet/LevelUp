import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeDifficultyLevel, sampleQuestions, shuffleQuestionPayload } from "@/lib/questionTransforms";
import { normalizeQuestionType } from "@/lib/questionTypes";
import { buildAdaptiveQuestionPlan, domainEnumToId, inferDomainFromQuestion, masteryToTargetDifficulty } from "@/lib/learningProfile";
import { goldenQuestionMeta, shouldSpawnGoldenQuestion } from "@/lib/goldenTicket";
import { getRequestUserId } from "@/app/api/_lib/authUser";

/**
 * Public: fetch the active question set + questions for a lane.
 * Adaptive mode is enabled automatically when a logged-in user exists.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const lane = (url.searchParams.get("lane") || "").toUpperCase() as any;
  const startingPosition = url.searchParams.get("startingPosition");
  const certExam = url.searchParams.get("certExam");
  const questionCountParam = Number(url.searchParams.get("questionCount") || "0");
  const shouldShuffle = !["0", "false", "no"].includes((url.searchParams.get("shuffle") || "true").toLowerCase());

  if (!lane) {
    return NextResponse.json({ error: "lane is required" }, { status: 400 });
  }

  const where: any = { lane, isActive: true };
  if (lane === "TRAINING") where.startingPosition = startingPosition;
  if (lane === "CERTIFICATIONS") where.certExam = certExam;

  const [placement, requestUserId] = await Promise.all([
    prisma.questionSetPlacement.findFirst({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        set: {
          include: {
            questions: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
          },
        },
      },
    }),
    getRequestUserId(req),
  ]);

  if (!placement?.set) {
    return NextResponse.json({ ok: true, placement: null, set: null, questions: [] });
  }

  const [masteryRows, historyRows, learningProfile] = requestUserId
    ? await Promise.all([
        prisma.userDomainMastery.findMany({ where: { userId: requestUserId } }),
        prisma.userQuestionHistory.findMany({ where: { userId: requestUserId }, orderBy: { answeredAt: "desc" }, take: 250 }),
        prisma.userLearningProfile.upsert({ where: { userId: requestUserId }, update: {}, create: { userId: requestUserId } }),
      ])
    : [[], [], null];

  const masteryByDomain = Object.fromEntries(
    masteryRows.map((row) => [domainEnumToId(row.domain), Number(row.mastery || 50)]),
  );
  const recentHistory = historyRows.map((row) => ({ questionId: row.questionId, correct: row.correct }));

  const mapped = placement.set.questions.map((q) => {
    const type = normalizeQuestionType(q.type);
    const rawData = q.data && typeof q.data === "object" ? q.data : {};
    const choices = Array.isArray(q.choices) ? (q.choices as string[]) : Array.isArray((rawData as any).choices) ? (rawData as any).choices : [];
    const correctIndex = typeof q.correctIndex === "number" ? q.correctIndex : typeof (rawData as any)?.correctIndex === "number" ? (rawData as any).correctIndex : null;
    const inferredDomain = inferDomainFromQuestion({
      tags: q.tags,
      prompt: q.prompt,
      data: rawData as any,
      domain: (rawData as any)?.domain || (rawData as any)?.domainId,
      setDomain: placement.set.domain,
    });
    const domainId = domainEnumToId(inferredDomain);
    const mastery = Number(masteryByDomain[domainId] ?? 50);
    const adaptiveTarget = masteryToTargetDifficulty(mastery);

    return {
      id: q.id,
      type,
      prompt: q.prompt,
      choices,
      correctIndex,
      data: rawData,
      explanation: q.explanation,
      difficulty: normalizeDifficultyLevel(q.difficulty),
      level: normalizeDifficultyLevel(q.difficulty),
      adaptiveTarget,
      domainId,
      domain: inferredDomain,
      tags: q.tags,
      sortOrder: q.sortOrder,
      setDomain: placement.set.domain,
    };
  });

  const desiredCount = Number.isFinite(questionCountParam) && questionCountParam > 0 ? questionCountParam : 20;
  const seenQuestionIds = new Set((historyRows || []).map((row) => String(row.questionId || "")));
  const unseenQuestions = mapped.filter((question) => !seenQuestionIds.has(String(question.id || "")));
  const questionPool = requestUserId && unseenQuestions.length >= Math.min(desiredCount, mapped.length)
    ? unseenQuestions
    : mapped;
  const questionPoolReset = Boolean(requestUserId && unseenQuestions.length < Math.min(desiredCount, mapped.length) && mapped.length > 0);
  const selected = requestUserId
    ? buildAdaptiveQuestionPlan({ questions: questionPool, questionCount: Math.min(desiredCount, questionPool.length || desiredCount), masteryByDomain, recentHistory })
    : sampleQuestions(questionPool, Math.min(desiredCount, questionPool.length || desiredCount));
  let questions = shouldShuffle ? selected.map((q) => shuffleQuestionPayload(q)) : selected;

  let goldenInfo = null as null | ReturnType<typeof goldenQuestionMeta>;
  if (requestUserId && questions.length) {
    const sessionsSinceLastGolden = Number(learningProfile?.sessionsSinceLastGolden || 0);
    const spawn = shouldSpawnGoldenQuestion(sessionsSinceLastGolden);
    goldenInfo = goldenQuestionMeta(sessionsSinceLastGolden);
    if (spawn.shouldSpawn) {
      const index = Math.floor(Math.random() * questions.length);
      questions = questions.map((question, questionIndex) => questionIndex === index ? {
        ...question,
        golden: true,
        goldenMeta: { ...goldenInfo, probability: spawn.probability, percent: Math.round(spawn.probability * 100) },
      } : question);
    }
  }

  return NextResponse.json({
    ok: true,
    placement: {
      id: placement.id,
      lane: placement.lane,
      startingPosition: placement.startingPosition,
      certExam: placement.certExam,
      createdAt: placement.createdAt,
    },
    set: {
      id: placement.set.id,
      name: placement.set.name,
      domain: placement.set.domain,
      status: placement.set.status,
      totalQuestions: placement.set.questions.length,
      returnedQuestions: questions.length,
      cycleReset: requestUserId ? (typeof questionPoolReset !== "undefined" ? questionPoolReset : false) : false,
      randomized: shouldShuffle,
      adaptive: Boolean(requestUserId),
    },
    learningProfile: requestUserId
      ? {
          masteryByDomain,
          weakestDomains: masteryRows.sort((a, b) => a.mastery - b.mastery).slice(0, 3).map((row) => domainEnumToId(row.domain)),
          sessionsSinceLastGolden: Number(learningProfile?.sessionsSinceLastGolden || 0),
          questionPoolReset,
          unseenRemaining: unseenQuestions.length,
        }
      : null,
    goldenTicket: requestUserId ? {
      ...goldenInfo,
      spawned: questions.some((question: any) => question.golden),
    } : null,
    questions,
  });
}
