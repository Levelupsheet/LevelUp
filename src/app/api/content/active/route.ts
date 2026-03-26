export const dynamic = "force-dynamic";
export const revalidate = 0;
import { NextResponse } from "next/server";
import { getRequestUserId } from "@/app/api/_lib/authUser";
import { buildQuestionBankSelection } from "@/lib/questionBank";

/**
 * Public: fetch the active question bank + adaptively selected questions for a lane.
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

  const userId = await getRequestUserId(req).catch(() => null);
  const requestedCount = Number.isFinite(questionCountParam) && questionCountParam > 0 ? questionCountParam : 0;
  const result = await buildQuestionBankSelection({
    lane,
    startingPosition,
    certExam,
    questionCount: requestedCount,
    shouldShuffle,
    excludeIds,
    userId,
  });

  if (!result.placements.length) {
    return NextResponse.json({ ok: true, placement: null, set: null, questions: [] });
  }

  const questions = requestedCount > 0 ? result.selectedQuestions : result.questions;

  return NextResponse.json({
    ok: true,
    placement: {
      lane,
      startingPosition,
      certExam,
      activePlacementIds: result.placements.map((placement) => placement.id),
      activeSetIds: result.placements.map((placement) => placement.setId),
      placementCount: result.placements.length,
    },
    set: {
      id: result.placements[0]?.set?.id || null,
      name: result.placements.length === 1 ? result.placements[0]?.set?.name : `${result.placements.length} active sets`,
      domain: result.placements.length === 1 ? result.placements[0]?.set?.domain : "MIXED",
      status: result.placements.every((placement) => placement.set?.status === "PUBLISHED") ? "PUBLISHED" : "MIXED",
      totalQuestions: result.questions.length,
      totalQuestionsBeforeDedup: result.totalQuestionsBeforeDedup,
      returnedQuestions: questions.length,
      randomized: shouldShuffle,
      adaptive: true,
    },
    questions,
  });
}
