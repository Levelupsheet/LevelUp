import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestUserId } from "@/app/api/_lib/authUser";
import { domainEnumToId, inferDomainFromQuestion, type LearningProfileSnapshot } from "@/lib/learningProfile";

const TARGET_DOMAINS = ["IDENTITY", "NETWORKING", "SECURITY", "AWS", "AZURE", "WINDOWS", "COMPUTE", "STORAGE"] as const;

function asNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function calcMastery(correct: number, wrong: number, fallbackXp = 0, seed = 0) {
  const total = correct + wrong;
  if (total > 0) {
    const accuracy = (correct / total) * 100;
    const confidenceBoost = Math.min(18, total * 1.75);
    return Math.max(0, Math.min(100, Number((accuracy * 0.78 + confidenceBoost + seed).toFixed(1))));
  }
  if (fallbackXp > 0) return Math.max(0, Math.min(100, Number((Math.min(100, fallbackXp / 4) + seed).toFixed(1))));
  return Math.max(0, Math.min(100, Number(seed.toFixed(1))));
}

export async function GET(req: Request) {
  try {
    const userId = await getRequestUserId(req);
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const client = prisma as any;

    const [profile, domainMasteryRaw, difficultyStatsRaw, recentHistoryRaw, practiceAnswers, certAnswers, userDomains, recentGameSession] = await Promise.all([
      client.userLearningProfile?.findUnique ? client.userLearningProfile.findUnique({ where: { userId } }) : Promise.resolve(null),
      client.userDomainMastery?.findMany ? client.userDomainMastery.findMany({ where: { userId }, orderBy: { mastery: "asc" } }) : Promise.resolve([]),
      client.userDifficultyAccuracy?.findMany ? client.userDifficultyAccuracy.findMany({ where: { userId }, orderBy: [{ domain: "asc" }, { difficulty: "asc" }] }) : Promise.resolve([]),
      client.userQuestionHistory?.findMany ? client.userQuestionHistory.findMany({ where: { userId }, orderBy: { answeredAt: "desc" }, take: 20 }) : Promise.resolve([]),
      prisma.practiceAnswer.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 250 }),
      prisma.certPracticeAnswer.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 250 }),
      prisma.userDomain.findMany({ where: { userId } }),
      prisma.gameSession.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, include: { questions: { orderBy: { orderIndex: "asc" } } } }).catch(() => null),
    ]);

    const masteryMap = new Map<string, { domain: string; mastery: number; correctCount: number; wrongCount: number; accuracy: number; currentDifficulty: number }>();
    const ensure = (domainInput?: string | null) => {
      const domain = String(domainInput || "GENERAL").toUpperCase();
      if (!masteryMap.has(domain)) masteryMap.set(domain, { domain, mastery: 0, correctCount: 0, wrongCount: 0, accuracy: 0, currentDifficulty: 1 });
      return masteryMap.get(domain)!;
    };

    for (const row of domainMasteryRaw || []) {
      const domain = String(row.domain || "GENERAL").toUpperCase();
      masteryMap.set(domain, {
        domain,
        mastery: asNum(row.mastery),
        correctCount: Number(row.correctCount || 0),
        wrongCount: Number(row.wrongCount || 0),
        accuracy: asNum(row.accuracy),
        currentDifficulty: Number(row.currentDifficulty || 1),
      });
    }

    for (const row of practiceAnswers || []) {
      const domain = inferDomainFromQuestion({ domain: row.domain, prompt: row.prompt });
      const slot = ensure(domain);
      slot.correctCount += 1;
      slot.currentDifficulty = Math.max(slot.currentDifficulty, Number(row.tier || 1));
      slot.mastery = Math.max(slot.mastery, calcMastery(slot.correctCount, slot.wrongCount, 0));
    }

    for (const row of certAnswers || []) {
      const exam = String(row.exam || "GENERAL").toUpperCase();
      const domain = exam === "AWS" ? "AWS" : exam === "AZURE" || exam === "AZ_900" ? "AZURE" : exam === "SECURITY_PLUS" ? "SECURITY" : "GENERAL";
      const slot = ensure(domain);
      slot.correctCount += 1;
      slot.currentDifficulty = Math.max(slot.currentDifficulty, 2);
      slot.mastery = Math.max(slot.mastery, calcMastery(slot.correctCount, slot.wrongCount, 0, 4));
    }

    for (const row of userDomains || []) {
      const domain = inferDomainFromQuestion({ domain: row.domain });
      const slot = ensure(domain);
      slot.mastery = Math.max(slot.mastery, calcMastery(slot.correctCount, slot.wrongCount, Number(row.xp || 0)));
    }

    const sessionMastery = recentGameSession?.stateJson && typeof recentGameSession.stateJson === "object" ? (recentGameSession.stateJson as any).mastery : null;
    if (sessionMastery && typeof sessionMastery === "object") {
      for (const [domainKey, value] of Object.entries(sessionMastery)) {
        const domain = String(domainKey || "GENERAL").toUpperCase();
        const slot = ensure(domain);
        slot.mastery = Math.max(slot.mastery, asNum(value));
      }
    }

    for (const row of recentGameSession?.questions || []) {
      const payload = row?.payloadJson && typeof row.payloadJson === "object" ? row.payloadJson : {};
      const domain = inferDomainFromQuestion({ domain: (payload as any).domainId, prompt: (payload as any).prompt, data: (payload as any).data, });
      const slot = ensure(domain);
      if (row.answered) {
        if (row.isCorrect === true) slot.correctCount += 1;
        else if (row.isCorrect === false) slot.wrongCount += 1;
      }
      slot.currentDifficulty = Math.max(slot.currentDifficulty, Number((payload as any).level || 1));
    }

    for (const key of TARGET_DOMAINS) ensure(key);

    const masteryRows = Array.from(masteryMap.values()).map((row) => {
      const total = row.correctCount + row.wrongCount;
      const accuracy = total > 0 ? Number(((row.correctCount / total) * 100).toFixed(1)) : row.accuracy;
      const mastery = row.mastery > 0 ? row.mastery : calcMastery(row.correctCount, row.wrongCount);
      return {
        domain: row.domain as any,
        mastery: Number(mastery.toFixed(1)),
        correctCount: row.correctCount,
        wrongCount: row.wrongCount,
        accuracy: Number((accuracy || 0).toFixed(1)),
        currentDifficulty: row.currentDifficulty || 1,
      };
    }).sort((a, b) => b.mastery - a.mastery);

    const activeRows = masteryRows.filter((row) => row.correctCount + row.wrongCount > 0 || row.mastery > 0);
    const overallMastery = Number((activeRows.length ? activeRows.reduce((sum, row) => sum + row.mastery, 0) / activeRows.length : 0).toFixed(1));
    const weakestDomains = [...activeRows].sort((a, b) => a.mastery - b.mastery).slice(0, 3).map((row) => row.domain as any);

    const recentHistory = (recentHistoryRaw || []).map((row: any) => ({
      questionId: row.questionId,
      prompt: row.prompt,
      domain: row.domain as any,
      difficulty: row.difficulty,
      correct: row.correct,
      answeredAt: row.answeredAt.toISOString(),
    }));

    const snapshot: LearningProfileSnapshot = {
      overallMastery: Number(profile?.overallMastery ?? overallMastery),
      weakestDomains: (profile?.weakestDomains?.length ? profile.weakestDomains : weakestDomains).map((d: any) => d as any),
      masteryByDomain: masteryRows,
      accuracyByDifficulty: (difficultyStatsRaw || []).map((row: any) => ({
        domain: row.domain as any,
        difficulty: row.difficulty,
        correctCount: row.correctCount,
        wrongCount: row.wrongCount,
        accuracy: Number(row.accuracy),
      })),
      recentHistory,
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
