import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/adminGuard";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try {
    const url = new URL(req.url);
    const knowledgeBlockId = String(url.searchParams.get("knowledgeBlockId") || "").trim();
    if (!knowledgeBlockId) return NextResponse.json({ error: "knowledgeBlockId is required" }, { status: 400 });

    const block = await (prisma as any).knowledgeBlock.findUnique({ where: { id: knowledgeBlockId } });
    if (!block) return NextResponse.json({ error: "Knowledge block not found" }, { status: 404 });

    const setId = `kb-${block.sourceBlockId}`;
    const liveQuestions = await prisma.mCQQuestion.findMany({
      where: { setId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        prompt: true,
        type: true,
        difficulty: true,
        testNowEligible: true,
        isGoldenEligible: true,
        goldenWeight: true,
        goldenBonusXp: true,
      },
    });

    const goldenEligibleIds = liveQuestions.filter((q) => q.isGoldenEligible).map((q) => q.id);
    const goldenSpawnRows = goldenEligibleIds.length
      ? await (prisma as any).gameSessionQuestion.findMany({
          where: { questionId: { in: goldenEligibleIds }, isGolden: true },
          orderBy: [{ createdAt: "desc" }],
          take: 50,
          include: {
            session: {
              select: {
                id: true,
                userId: true,
                createdAt: true,
                completedAt: true,
                status: true,
                mode: true,
                setId: true,
              },
            },
          },
        })
      : [];

    const totalGoldenSpawns = goldenSpawnRows.length;
    const correctGoldenAnswers = goldenSpawnRows.filter((row: any) => row.answered && row.isCorrect === true).length;
    const missedGoldenAnswers = goldenSpawnRows.filter((row: any) => row.answered && row.isCorrect === false).length;
    const unansweredGoldenSpawns = goldenSpawnRows.filter((row: any) => !row.answered).length;

    return NextResponse.json({
      ok: true,
      tracking: {
        knowledgeBlockId,
        setId,
        lane: block.lane,
        totalLiveQuestions: liveQuestions.length,
        testNowEligibleCount: liveQuestions.filter((q) => q.testNowEligible).length,
        goldenEligibleCount: liveQuestions.filter((q) => q.isGoldenEligible).length,
        totalGoldenSpawns,
        correctGoldenAnswers,
        missedGoldenAnswers,
        unansweredGoldenSpawns,
        liveGoldenQuestions: liveQuestions
          .filter((q) => q.isGoldenEligible)
          .map((q) => ({
            id: q.id,
            prompt: q.prompt,
            type: q.type,
            difficulty: q.difficulty,
            goldenWeight: q.goldenWeight,
            goldenBonusXp: q.goldenBonusXp,
            testNowEligible: q.testNowEligible,
          })),
        recentGoldenSpawns: goldenSpawnRows.map((row: any) => ({
          sessionQuestionId: row.id,
          questionId: row.questionId,
          orderIndex: row.orderIndex,
          goldenBonusXp: row.goldenBonusXp,
          answered: row.answered,
          isCorrect: row.isCorrect,
          answeredAt: row.answeredAt,
          createdAt: row.createdAt,
          session: row.session,
        })),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load golden tracking" }, { status: 500 });
  }
}
