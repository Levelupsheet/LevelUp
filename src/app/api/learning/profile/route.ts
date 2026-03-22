import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestUserId } from "@/app/api/_lib/authUser";
import { inferDomainFromQuestion, type LearningProfileSnapshot } from "@/lib/learningProfile";

const TARGET_DOMAINS = ["IDENTITY", "NETWORKING", "SECURITY", "AWS", "AZURE", "WINDOWS"] as const;

function asNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function calcMastery(correct: number, wrong: number, fallbackXp = 0, seed = 0) {
  const total = correct + wrong;
  const xpPct = Math.max(0, Math.min(100, (Number(fallbackXp || 0) / 8000) * 100));
  if (total > 0) {
    const accuracy = (correct / total) * 100;
    const volumeFactor = Math.max(0.08, Math.min(1, total / 40));
    const confidenceBoost = Math.min(4, total * 0.12);
    const blendedBase = accuracy * 0.18 + xpPct * 0.82;
    const blended = blendedBase * volumeFactor + confidenceBoost + seed;
    return Math.max(0, Math.min(100, Number(blended.toFixed(1))));
  }
  if (fallbackXp > 0) return Math.max(0, Math.min(100, Number(((xpPct * 0.65) + seed).toFixed(1))));
  return Math.max(0, Math.min(100, Number(seed.toFixed(1))));
}

type DomainAggregate = {
  domain: string;
  mastery: number;
  correctCount: number;
  wrongCount: number;
  accuracy: number;
  currentDifficulty: number;
};

export async function GET(req: Request) {
  try {
    const userId = await getRequestUserId(req);
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const [practiceAnswers, certAnswers, userDomains, gameSessionQuestions] = await Promise.all([
      prisma.practiceAnswer.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 250 }),
      prisma.certPracticeAnswer.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 250 }),
      prisma.userDomain.findMany({ where: { userId } }),
      prisma.gameSessionQuestion.findMany({
        where: {
          answered: true,
          session: {
            userId,
            status: "COMPLETED",
          },
        },
        select: {
          isCorrect: true,
          payloadJson: true,
          session: { select: { mode: true } },
        },
        orderBy: { answeredAt: "desc" },
        take: 500,
      }).catch(() => [] as any[]),
    ]);

    const masteryMap = new Map<string, DomainAggregate>();
    const ensure = (domainInput?: string | null) => {
      const domain = String(domainInput || "GENERAL").toUpperCase();
      if (!masteryMap.has(domain)) masteryMap.set(domain, { domain, mastery: 0, correctCount: 0, wrongCount: 0, accuracy: 0, currentDifficulty: 1 });
      return masteryMap.get(domain)!;
    };

    for (const row of practiceAnswers || []) {
      const domain = inferDomainFromQuestion({ domain: row.domain, prompt: row.prompt });
      const slot = ensure(domain);
      slot.correctCount += 1;
      slot.currentDifficulty = Math.max(slot.currentDifficulty, Number(row.tier || 1));
    }

    for (const row of certAnswers || []) {
      const exam = String(row.exam || "GENERAL").toUpperCase();
      const domain = exam === "AWS" ? "AWS" : exam === "AZURE" || exam === "AZ_900" ? "AZURE" : exam === "SECURITY_PLUS" ? "SECURITY" : "GENERAL";
      const slot = ensure(domain);
      slot.correctCount += 1;
      slot.currentDifficulty = Math.max(slot.currentDifficulty, 2);
    }

    for (const row of gameSessionQuestions || []) {
      const payload = row?.payloadJson && typeof row.payloadJson === "object" ? row.payloadJson as any : {};
      const rawDomain = String(payload?.domainId || payload?.data?.domainId || payload?.data?.domain || (Array.isArray(payload?.tags) ? payload.tags[0] : "") || "general");
      const domain = inferDomainFromQuestion({ domain: rawDomain, prompt: String(payload?.prompt || "") });
      const slot = ensure(domain);
      if (row?.isCorrect === true) slot.correctCount += 1;
      else if (row?.isCorrect === false) slot.wrongCount += 1;
      slot.currentDifficulty = Math.max(slot.currentDifficulty, Number(payload?.difficulty || payload?.level || 1));
    }

    for (const row of userDomains || []) {
      const domain = inferDomainFromQuestion({ domain: row.domain });
      const slot = ensure(domain);
      slot.mastery = Math.max(slot.mastery, calcMastery(slot.correctCount, slot.wrongCount, Number(row.xp || 0), domain === "AZURE" || domain === "AWS" ? 4 : 0));
      slot.currentDifficulty = Math.max(slot.currentDifficulty, slot.mastery >= 70 ? 3 : slot.mastery >= 40 ? 2 : 1);
    }

    for (const key of TARGET_DOMAINS) ensure(key);

    const masteryRows = Array.from(masteryMap.values())
      .filter((row) => TARGET_DOMAINS.includes(row.domain as any))
      .map((row) => {
        const total = row.correctCount + row.wrongCount;
        const accuracy = total > 0 ? Number(((row.correctCount / total) * 100).toFixed(1)) : row.accuracy;
        const mastery = row.mastery > 0 ? row.mastery : calcMastery(row.correctCount, row.wrongCount);
        return {
          domain: row.domain as any,
          mastery: Number(mastery.toFixed(1)),
          correctCount: row.correctCount,
          wrongCount: row.wrongCount,
          accuracy,
          currentDifficulty: row.currentDifficulty,
        };
      })
      .sort((a, b) => a.domain.localeCompare(b.domain));

    const overallMastery = masteryRows.length ? Number((masteryRows.reduce((sum, row) => sum + row.mastery, 0) / masteryRows.length).toFixed(1)) : 0;

    const snapshot: LearningProfileSnapshot = {
      overallMastery,
      weakestDomains: [...masteryRows].sort((a, b) => a.mastery - b.mastery).slice(0, 3).map((row) => row.domain as any),
      masteryByDomain: masteryRows as any,
      accuracyByDifficulty: masteryRows.map((row) => ({ domain: row.domain as any, difficulty: row.currentDifficulty, correctCount: row.correctCount, wrongCount: row.wrongCount, accuracy: row.accuracy })),
      recentHistory: [],
    };

    return NextResponse.json({ ok: true, profile: snapshot });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to load learning profile" }, { status: 500 });
  }
}
