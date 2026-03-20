import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestUserId } from "@/app/api/_lib/authUser";
import { computeAccuracy, domainEnumToId, masteryToTargetDifficulty, normalizeQuestionDomain, summarizeWeakestDomains, type LearningProfileSnapshot } from "@/lib/learningProfile";

export async function GET(req: Request) {
  try {
    const userId = await getRequestUserId(req);
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const [profile, domainMastery, difficultyStats, recentHistory, userDomains] = await Promise.all([
      prisma.userLearningProfile.findUnique({ where: { userId } }),
      prisma.userDomainMastery.findMany({ where: { userId }, orderBy: { mastery: "asc" } }),
      prisma.userDifficultyAccuracy.findMany({ where: { userId }, orderBy: [{ domain: "asc" }, { difficulty: "asc" }] }),
      prisma.userQuestionHistory.findMany({ where: { userId }, orderBy: { answeredAt: "desc" }, take: 20 }),
      prisma.userDomain.findMany({ where: { userId }, orderBy: { xp: "desc" } }),
    ]);

    const masteryRows = domainMastery.length
      ? domainMastery.map((row) => ({
          domain: row.domain as any,
          mastery: Number(row.mastery),
          correctCount: row.correctCount,
          wrongCount: row.wrongCount,
          accuracy: Number(row.accuracy),
          currentDifficulty: row.currentDifficulty,
        }))
      : userDomains.map((row) => {
          const domain = normalizeQuestionDomain(row.domain);
          const mastery = Math.max(0, Math.min(100, Math.round(Number(row.xp || 0) / 3)));
          const correctCount = Math.max(0, Math.round(Number(row.xp || 0) / 12));
          const wrongCount = 0;
          return {
            domain: domain as any,
            mastery,
            correctCount,
            wrongCount,
            accuracy: computeAccuracy(correctCount, wrongCount),
            currentDifficulty: masteryToTargetDifficulty(mastery),
          };
        });

    const overallMastery = masteryRows.length
      ? Math.round(masteryRows.reduce((sum, row) => sum + Number(row.mastery || 0), 0) / masteryRows.length)
      : Number(profile?.overallMastery ?? 0);

    const snapshot: LearningProfileSnapshot = {
      overallMastery,
      weakestDomains: ((profile?.weakestDomains?.length ? profile.weakestDomains : summarizeWeakestDomains(masteryRows)) || []).map((d) => d as any),
      masteryByDomain: masteryRows,
      accuracyByDifficulty: difficultyStats.map((row) => ({
        domain: row.domain as any,
        difficulty: row.difficulty,
        correctCount: row.correctCount,
        wrongCount: row.wrongCount,
        accuracy: Number(row.accuracy),
      })),
      recentHistory: recentHistory.map((row) => ({
        questionId: row.questionId,
        prompt: row.prompt,
        domain: row.domain as any,
        difficulty: row.difficulty,
        correct: row.correct,
        answeredAt: row.answeredAt.toISOString(),
      })),
    };

    return NextResponse.json({
      ok: true,
      userId,
      overview: {
        overallMastery: snapshot.overallMastery,
        weakestDomains: snapshot.weakestDomains.map((d) => domainEnumToId(d)),
      },
      profile: snapshot,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load learning profile" }, { status: 500 });
  }
}
