export const dynamic = "force-dynamic";
export const revalidate = 0;
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeDifficultyLevel, sampleQuestions, shuffleQuestionPayload } from "@/lib/questionTransforms";
import { normalizeQuestionType } from "@/lib/questionTypes";

/**
 * Public: fetch the active question set + questions for a lane.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const lane = (url.searchParams.get("lane") || "").toUpperCase() as any;
  const startingPosition = url.searchParams.get("startingPosition");
  const certExam = url.searchParams.get("certExam");
  const questionCountParam = Number(url.searchParams.get("questionCount") || "0");
  const shouldShuffle = !["0", "false", "no"].includes((url.searchParams.get("shuffle") || "true").toLowerCase());
  const excludeIds = (url.searchParams.get("excludeIds") || "").split(",").map((v) => v.trim()).filter(Boolean);

  if (!lane) {
    return NextResponse.json({ error: "lane is required" }, { status: 400 });
  }

  const where: any = { lane, isActive: true };
  if (lane === "TRAINING") where.startingPosition = startingPosition;
  if (lane === "CERTIFICATIONS") where.certExam = certExam;

  const placement = await prisma.questionSetPlacement.findFirst({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      set: {
        include: {
          questions: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        },
      },
    },
  });

  if (!placement?.set) {
    return NextResponse.json({ ok: true, placement: null, set: null, questions: [] });
  }

  const mapped = placement.set.questions.map((q) => {
    const type = normalizeQuestionType(q.type);
    const rawData = q.data && typeof q.data === "object" ? q.data : {};
    const choices = Array.isArray(q.choices) ? (q.choices as string[]) : Array.isArray((rawData as any).choices) ? (rawData as any).choices : [];
    const correctIndex = typeof q.correctIndex === "number" ? q.correctIndex : typeof (rawData as any).correctIndex === "number" ? (rawData as any).correctIndex : null;

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
      tags: q.tags,
      sortOrder: q.sortOrder,
    };
  });

  const filtered = excludeIds.length ? mapped.filter((q) => !excludeIds.includes(String(q.id))) : mapped;
  const fallbackPool = filtered.length >= (Number.isFinite(questionCountParam) ? questionCountParam : 0) ? filtered : [...filtered, ...mapped.filter((q) => !filtered.some((f) => f.id === q.id))];
  const sampled = sampleQuestions(fallbackPool, Number.isFinite(questionCountParam) ? questionCountParam : 0);
  const questions = shouldShuffle ? sampled.map((q) => shuffleQuestionPayload(q)) : sampled;

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
      randomized: shouldShuffle,
    },
    questions,
  });
}
