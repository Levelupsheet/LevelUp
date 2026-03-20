import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestUserId } from "@/app/api/_lib/authUser";
import { domainEnumToId, inferDomainFromQuestion, type LearningProfileSnapshot } from "@/lib/learningProfile";

export async function GET(req: Request) {
  try {
    const userId = await getRequestUserId(req);
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const client = prisma as any;
    const [profile, domainMastery, difficultyStats, recentHistory, practiceAnswers, certAnswers] = await Promise.all([
      client.userLearningProfile?.findUnique({ where: { userId } }).catch(() => null),
      client.userDomainMastery?.findMany({ where: { userId }, orderBy: { mastery: "asc" } }).catch(() => []),
      client.userDifficultyAccuracy?.findMany({ where: { userId }, orderBy: [{ domain: "asc" }, { difficulty: "asc" }] }).catch(() => []),
      client.userQuestionHistory?.findMany({ where: { userId }, orderBy: { answeredAt: "desc" }, take: 20 }).catch(() => []),
      prisma.practiceAnswer.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }).catch(() => []),
      client.certAnswers ? client.certAnswers.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }).catch(() => []) : client.certPracticeAnswer ? client.certPracticeAnswer.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }).catch(() => []) : [],
    ]);

    let masteryRows = Array.isArray(domainMastery) ? domainMastery : [];

    if (!masteryRows.length) {
      const bucket = new Map<string, { domain: string; mastery: number; correctCount: number; wrongCount: number; accuracy: number; currentDifficulty: number }>();
      for (const row of practiceAnswers) {
        const domain = inferDomainFromQuestion({ domain: row.domain, prompt: row.prompt });
        const key = String(domain);
        const current = bucket.get(key) || { domain: key, mastery: 0, correctCount: 0, wrongCount: 0, accuracy: 0, currentDifficulty: 1 };
        current.mastery = Math.min(100, current.mastery + Math.max(5, Math.round(Number(row.xpAwarded || 0) / 4)));
        current.correctCount += 1;
        current.currentDifficulty = Math.max(current.currentDifficulty, Number(row.tier || 1));
        current.accuracy = current.correctCount ? 100 : 0;
        bucket.set(key, current);
      }
      for (const row of certAnswers) {
        const domain = inferDomainFromQuestion({ domain: row.exam, prompt: row.prompt });
        const key = String(domain);
        const current = bucket.get(key) || { domain: key, mastery: 0, correctCount: 0, wrongCount: 0, accuracy: 0, currentDifficulty: 1 };
        current.mastery = Math.min(100, current.mastery + Math.max(6, Math.round(Number(row.xpAwarded || 0) / 5)));
        current.correctCount += 1;
        current.accuracy = current.correctCount ? 100 : 0;
        bucket.set(key, current);
      }
      masteryRows = Array.from(bucket.values()).sort((a, b) => Number(a.mastery) - Number(b.mastery));
    }

    const snapshot: LearningProfileSnapshot = {
      overallMastery: Number(profile?.overallMastery ?? (masteryRows.length ? masteryRows.reduce((sum: number, row: any) => sum + Number(row.mastery || 0), 0) / masteryRows.length : 0)),
      weakestDomains: Array.isArray(profile?.weakestDomains) ? (profile.weakestDomains || []).map((d: any) => d as any) : masteryRows.slice().sort((a: any, b: any) => Number(a.mastery) - Number(b.mastery)).slice(0, 3).map((row: any) => row.domain as any),
      masteryByDomain: masteryRows.map((row: any) => ({
        domain: row.domain as any,
        mastery: Number(row.mastery),
        correctCount: Number(row.correctCount || 0),
        wrongCount: Number(row.wrongCount || 0),
        accuracy: Number(row.accuracy || 0),
        currentDifficulty: Number(row.currentDifficulty || 1),
      })),
      accuracyByDifficulty: Array.isArray(difficultyStats) ? difficultyStats.map((row: any) => ({
        domain: row.domain as any,
        difficulty: row.difficulty,
        correctCount: row.correctCount,
        wrongCount: row.wrongCount,
        accuracy: Number(row.accuracy),
      })) : [],
      recentHistory: Array.isArray(recentHistory) ? recentHistory.map((row: any) => ({
        questionId: row.questionId,
        prompt: row.prompt,
        domain: row.domain as any,
        difficulty: row.difficulty,
        correct: row.correct,
        answeredAt: row.answeredAt.toISOString(),
      })) : [],
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
