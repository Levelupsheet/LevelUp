import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestUserId } from "@/app/api/_lib/authUser";
import { computeAccuracy, domainEnumToId, inferDomainFromQuestion, nextMasteryValue, summarizeWeakestDomains, type LearningProfileSnapshot } from "@/lib/learningProfile";

type Row = { domain: string; mastery: number; correctCount: number; wrongCount: number; accuracy: number; currentDifficulty: number };


function examToDomain(exam?: string | null): string {
  const value = String(exam || "").toUpperCase();
  if (value === "AWS") return "AWS";
  if (value === "AZURE" || value === "AZ_900") return "AZURE";
  if (value === "SECURITY_PLUS") return "SECURITY";
  if (value === "A_PLUS") return "WINDOWS";
  return "GENERAL";
}

function buildRowsFromCounts(counts: Map<string, { correct: number; wrong: number; currentDifficulty: number; mastery?: number }>): Row[] {
  const rows: Row[] = [];
  for (const [domain, data] of counts.entries()) {
    const correctCount = Number(data.correct || 0);
    const wrongCount = Number(data.wrong || 0);
    const accuracy = computeAccuracy(correctCount, wrongCount);
    let mastery = Number(data.mastery ?? 0);
    if (!Number.isFinite(mastery) || mastery <= 0) {
      let running = 50;
      for (let i = 0; i < correctCount; i += 1) running = nextMasteryValue(running, true, data.currentDifficulty || 1);
      for (let i = 0; i < wrongCount; i += 1) running = nextMasteryValue(running, false, data.currentDifficulty || 1);
      mastery = Number(running.toFixed(1));
    }
    rows.push({ domain, mastery, correctCount, wrongCount, accuracy, currentDifficulty: data.currentDifficulty || 1 });
  }
  return rows.sort((a, b) => b.mastery - a.mastery);
}

export async function GET(req: Request) {
  try {
    const userId = await getRequestUserId(req);
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const [userDomains, practiceAnswers, certAnswers, sessions] = await Promise.all([
      prisma.userDomain.findMany({ where: { userId }, orderBy: { xp: "desc" } }),
      prisma.practiceAnswer.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 250, select: { domain: true, xpAwarded: true, createdAt: true } }),
      prisma.certPracticeAnswer.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 250, select: { exam: true, xpAwarded: true, createdAt: true } }),
      (prisma as any).gameSession?.findMany ? (prisma as any).gameSession.findMany({ where: { userId, status: "COMPLETED" }, orderBy: { createdAt: "desc" }, take: 25, include: { questions: true } }) : Promise.resolve([]),
    ]);

    const counts = new Map<string, { correct: number; wrong: number; currentDifficulty: number; mastery?: number }>();
    const touch = (domainRaw?: string | null) => {
      const domain = String(domainEnumToId(domainRaw || "general") || "general").toUpperCase();
      if (!counts.has(domain)) counts.set(domain, { correct: 0, wrong: 0, currentDifficulty: 1 });
      return counts.get(domain)!;
    };

    for (const row of userDomains) {
      const domain = String(domainEnumToId(row.domain)).toUpperCase();
      const entry = touch(domain);
      const xp = Number(row.xp || 0);
      entry.mastery = Math.max(Number(entry.mastery || 0), Math.min(100, Math.round(xp / 2)));
      entry.correct += Math.max(0, Math.round(xp / 25));
      entry.currentDifficulty = xp >= 350 ? 3 : xp >= 175 ? 2 : 1;
    }

    for (const row of practiceAnswers) {
      const entry = touch(row.domain);
      const xp = Number(row.xpAwarded || 0);
      entry.correct += Math.max(1, Math.round(xp / 10));
      entry.currentDifficulty = Math.max(entry.currentDifficulty, xp >= 45 ? 3 : xp >= 28 ? 2 : 1);
    }

    for (const row of certAnswers) {
      const entry = touch(examToDomain(String(row.exam)));
      const xp = Number(row.xpAwarded || 0);
      entry.correct += Math.max(1, Math.round(xp / 10));
      entry.currentDifficulty = Math.max(entry.currentDifficulty, xp >= 35 ? 3 : xp >= 20 ? 2 : 1);
    }

    for (const session of sessions as any[]) {
      for (const q of Array.isArray(session?.questions) ? session.questions : []) {
        if (!q?.answered) continue;
        const payload: any = (q?.payloadJson && typeof q.payloadJson === 'object') ? q.payloadJson : {};
        const domain = inferDomainFromQuestion({ domain: payload.domainId, prompt: payload.prompt, data: payload.data, tags: payload.tags });
        const entry = touch(domain);
        if (q.isCorrect) entry.correct += 1;
        else entry.wrong += 1;
        entry.currentDifficulty = Math.max(entry.currentDifficulty, Number(payload.level || payload.difficulty || 1) || 1);
        entry.mastery = nextMasteryValue(Number(entry.mastery ?? 50), Boolean(q.isCorrect), entry.currentDifficulty);
      }
    }

    const rows = buildRowsFromCounts(counts);
    const snapshot: LearningProfileSnapshot = {
      overallMastery: rows.length ? Math.round(rows.reduce((sum, row) => sum + Number(row.mastery || 0), 0) / rows.length) : 0,
      weakestDomains: summarizeWeakestDomains(rows.map((row) => ({ domain: row.domain, mastery: row.mastery }))),
      masteryByDomain: rows.map((row) => ({ domain: row.domain as any, mastery: row.mastery, correctCount: row.correctCount, wrongCount: row.wrongCount, accuracy: row.accuracy, currentDifficulty: row.currentDifficulty })),
      accuracyByDifficulty: rows.map((row) => ({ domain: row.domain as any, difficulty: row.currentDifficulty, correctCount: row.correctCount, wrongCount: row.wrongCount, accuracy: row.accuracy })),
      recentHistory: [],
    };

    return NextResponse.json({ ok: true, userId, overview: { overallMastery: snapshot.overallMastery, weakestDomains: snapshot.weakestDomains.map((d) => domainEnumToId(d)) }, profile: snapshot });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load learning profile" }, { status: 500 });
  }
}
