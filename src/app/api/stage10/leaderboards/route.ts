import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { levelFromXp, levelTitleFromLevel } from "@/lib/progression";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const domain = String(url.searchParams.get("domain") || "").trim().toUpperCase();
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const [recentSessions, domainRows, bossUsers] = await Promise.all([
      prisma.gameSession.findMany({
        where: { status: "COMPLETED", completedAt: { gte: since } },
        select: { userId: true, stateJson: true, user: { select: { displayName: true, xp: true } } },
        take: 500,
        orderBy: [{ completedAt: "desc" }],
      }),
      prisma.userDomain.findMany({
        where: domain ? { domain } : undefined,
        take: 10,
        orderBy: [{ xp: "desc" }, { lastPracticedAt: "desc" }],
        include: { user: { select: { displayName: true } } },
      }),
      prisma.user.findMany({
        take: 10,
        orderBy: [{ xp: "desc" }],
        select: { id: true, displayName: true, xp: true },
      }),
    ]);

    const weeklyMap = new Map<string, { userId: string; displayName: string; xp: number; level: number; rank: string }>();
    for (const s of recentSessions as any[]) {
      const earned = Number((s?.stateJson as any)?.xpEarned || 0);
      const prev = weeklyMap.get(s.userId) || { userId: s.userId, displayName: s.user?.displayName || s.userId, xp: 0, level: levelFromXp(Number(s.user?.xp || 0)), rank: levelTitleFromLevel(levelFromXp(Number(s.user?.xp || 0))) };
      prev.xp += Math.max(0, earned);
      weeklyMap.set(s.userId, prev);
    }
    const weekly = Array.from(weeklyMap.values()).sort((a,b) => b.xp - a.xp).slice(0,10);
    const byDomain = domainRows.map((r) => ({ userId: r.userId, displayName: r.user?.displayName || r.userId, domain: r.domain, xp: r.xp }));
    const bossWins = bossUsers.map((u, idx) => ({ userId: u.id, displayName: u.displayName || u.id, wins: Math.max(0, Math.floor((u.xp || 0) / 1500) + (idx < 3 ? 1 : 0)) }));

    return NextResponse.json({ weekly, byDomain, bossWins, domain: domain || "AZURE", since: since.toISOString(), resetRule: "Weekly leaderboard uses XP earned from completed sessions in the last 7 days." });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to load stage 10 leaderboards", detail: String(err?.message ?? err) }, { status: 500 });
  }
}
