
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 14);

    const [sessions, userDomains, calibrations] = await Promise.all([
      prisma.gameSession.findMany({
        where: { createdAt: { gte: since } },
        include: { questions: true },
        orderBy: [{ createdAt: 'desc' }],
        take: 500,
      }),
      prisma.userDomain.findMany({ orderBy: [{ xp: 'asc' }], take: 12 }),
      (prisma as any).$queryRawUnsafe(`SELECT * FROM "QuestionCalibration" ORDER BY "updatedAt" DESC LIMIT 25`).catch(() => []),
    ]);

    const completed = sessions.filter((s: any) => s.status === 'COMPLETED');
    const abandoned = sessions.filter((s: any) => s.status === 'ABANDONED' || s.status === 'EXPIRED');
    const quitAtQuestionCounts: Record<string, number> = {};
    const byType: Record<string, { attempts: number; correct: number }> = {};
    for (const s of sessions as any[]) {
      const idx = Number(s.currentIndex || 0);
      if (s.status !== 'COMPLETED') quitAtQuestionCounts[String(idx || 0)] = (quitAtQuestionCounts[String(idx || 0)] || 0) + 1;
      for (const q of (s.questions || [])) {
        const t = String((q.payloadJson as any)?.type || 'unknown').toLowerCase();
        byType[t] = byType[t] || { attempts: 0, correct: 0 };
        byType[t].attempts += q.answered ? 1 : 0;
        byType[t].correct += q.isCorrect ? 1 : 0;
      }
    }

    const hardestQuestionTypes = Object.entries(byType).map(([type, stats]) => ({
      type,
      attempts: stats.attempts,
      accuracy: stats.attempts ? Number((stats.correct / stats.attempts * 100).toFixed(1)) : 0,
    })).sort((a,b) => a.accuracy - b.accuracy);

    const weakDomains = userDomains.slice(0, 8).map((d: any) => ({ domain: d.domain, xp: d.xp, userId: d.userId }));
    const quitPoints = Object.entries(quitAtQuestionCounts).map(([question, count]) => ({ question: Number(question), count })).sort((a,b) => b.count - a.count).slice(0, 8);
    const calibrationSummary = (calibrations as any[]).map((row) => ({ questionId: row.questionId, observedAccuracy: Number((Number(row.observedAccuracy || 0) * 100).toFixed(1)), avgResponseMs: Number(row.avgResponseMs || 0), difficultyDrift: Number(row.difficultyDrift || 0) }));

    return NextResponse.json({
      summary: {
        sessionCount: sessions.length,
        completedSessions: completed.length,
        abandonedSessions: abandoned.length,
        completionRate: sessions.length ? Number((completed.length / sessions.length * 100).toFixed(1)) : 0,
      },
      weakDomains,
      hardestQuestionTypes,
      quitPoints,
      calibrationSummary,
      since: since.toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to load Stage 11 overview', detail: String(err?.message || err) }, { status: 500 });
  }
}
