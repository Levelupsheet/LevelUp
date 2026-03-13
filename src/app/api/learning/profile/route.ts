import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestUserId } from "@/app/api/_lib/authUser";
import { domainEnumToId, type LearningProfileSnapshot } from "@/lib/learningProfile";

export async function GET(req: Request) {
  try {
    const userId = await getRequestUserId(req);
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const [profile, domainMastery, difficultyStats, recentHistory] = await Promise.all([
      prisma.userLearningProfile.findUnique({ where: { userId } }),
      prisma.userDomainMastery.findMany({ where: { userId }, orderBy: { mastery: "asc" } }),
      prisma.userDifficultyAccuracy.findMany({ where: { userId }, orderBy: [{ domain: "asc" }, { difficulty: "asc" }] }),
      prisma.userQuestionHistory.findMany({ where: { userId }, orderBy: { answeredAt: "desc" }, take: 20 }),
    ]);

    const snapshot: LearningProfileSnapshot = {
      overallMastery: Number(profile?.overallMastery ?? 50),
      weakestDomains: (profile?.weakestDomains || []).map((d) => d as any),
      masteryByDomain: domainMastery.map((row) => ({
        domain: row.domain as any,
        mastery: Number(row.mastery),
        correctCount: row.correctCount,
        wrongCount: row.wrongCount,
        accuracy: Number(row.accuracy),
        currentDifficulty: row.currentDifficulty,
      })),
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
