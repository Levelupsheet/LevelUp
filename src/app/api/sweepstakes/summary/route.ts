import { prisma } from "@/lib/prisma";
import { getRequestUserId } from "@/app/api/_lib/authUser";
import { countWeeklyEntries, drawSweepstakesWinner, getOrCreateActiveSweepstakes, RAFFLE_WEEKLY_ENTRY_LIMIT, startOfWeekUtc } from "@/lib/raffle";
import { getPrizePoolSummary } from "@/lib/prizePools";
import { isSweepstakesPublicEnabled } from "@/lib/sweepstakesConfig";

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function maybeAutoDrawCampaign(campaign: any) {
  if (!campaign) return campaign;
  const now = new Date();
  if (campaign.winnerEntryId || campaign.status === "DRAWN" || new Date(campaign.endsAt) > now) return campaign;
  await prisma.$transaction(async (tx: any) => {
    const fresh = await tx.sweepstakesCampaign.findUnique({ where: { id: campaign.id } });
    if (!fresh || fresh.winnerEntryId || fresh.status === "DRAWN" || new Date(fresh.endsAt) > now) return;
    await drawSweepstakesWinner(tx as any, fresh.id);
  });
  return (prisma as any).sweepstakesCampaign.findUnique({ where: { id: campaign.id } });
}

async function campaignView(campaign: any) {
  if (!campaign) return null;
  const entries = await (prisma as any).raffleEntry.findMany({
    where: { campaignId: campaign.id },
    orderBy: { createdAt: "asc" },
  });

  const byUser = new Map<string, { userId: string; quantity: number; tickets: number; lastEntryAt: Date | null }>();
  for (const entry of entries) {
    const key = String(entry.userId || "");
    if (!key) continue;
    const cur = byUser.get(key) || { userId: key, quantity: 0, tickets: 0, lastEntryAt: null };
    cur.quantity += num(entry.quantity, 0);
    cur.tickets += 1;
    cur.lastEntryAt = entry.createdAt;
    byUser.set(key, cur);
  }

  const userIds = [...byUser.keys()];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true, email: true } })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const leaderboard = [...byUser.values()]
    .map((row) => ({
      userId: row.userId,
      displayName: userMap.get(row.userId)?.displayName || userMap.get(row.userId)?.email || row.userId,
      quantity: row.quantity,
      tickets: row.tickets,
      lastEntryAt: row.lastEntryAt,
      isWinner: String(campaign.winnerUserId || "") === String(row.userId),
    }))
    .sort((a, b) => b.quantity - a.quantity || new Date(a.lastEntryAt || 0).getTime() - new Date(b.lastEntryAt || 0).getTime())
    .slice(0, 50);

  let winnerUser = null as any;
  if (campaign.winnerUserId) {
    winnerUser = userMap.get(String(campaign.winnerUserId)) || (await prisma.user.findUnique({
      where: { id: String(campaign.winnerUserId) },
      select: { id: true, displayName: true, email: true },
    }).catch(() => null));
  }

  return {
    id: campaign.id,
    slug: campaign.slug,
    title: campaign.title,
    status: campaign.status,
    isLive: Boolean(campaign.isLive),
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    drawnAt: campaign.drawnAt,
    prizePoolCents: campaign.prizePoolCents,
    prizePoolLabel: campaign.prizePoolLabel,
    termsUrl: campaign.termsUrl || null,
    totalEntries: entries.reduce((sum: number, entry: any) => sum + num(entry.quantity, 0), 0),
    totalParticipants: leaderboard.length,
    winner: winnerUser
      ? {
          userId: winnerUser.id,
          displayName: winnerUser.displayName || winnerUser.email || winnerUser.id,
          drawnAt: campaign.drawnAt,
        }
      : null,
    leaderboard,
  };
}

export async function GET(req: Request) {
  try {
    const userId = await getRequestUserId(req);
    let campaign = await getOrCreateActiveSweepstakes(prisma as any);
    campaign = await maybeAutoDrawCampaign(campaign);
    const now = new Date();
    const prizePools = await getPrizePoolSummary(prisma as any);

    let userSummary = null as any;
    if (userId && campaign?.id) {
      const weekStart = startOfWeekUtc(now);
      const [weeklyCount, sourceBreakdown, campaignCount] = await Promise.all([
        countWeeklyEntries(prisma as any, userId, weekStart),
        (prisma as any).raffleEntry.groupBy({ by: ["source"], where: { userId, weekStart }, _sum: { quantity: true } }),
        (prisma as any).raffleEntry.aggregate({ where: { userId, campaignId: campaign.id }, _sum: { quantity: true } }),
      ]);
      userSummary = {
        userId,
        weeklyCount,
        campaignEntries: Number(campaignCount._sum.quantity || 0),
        remainingThisWeek: Math.max(0, RAFFLE_WEEKLY_ENTRY_LIMIT - weeklyCount),
        weeklyLimit: RAFFLE_WEEKLY_ENTRY_LIMIT,
        sources: sourceBreakdown.map((row: any) => ({ source: row.source, quantity: Number(row._sum.quantity || 0) })),
      };
    }

    const recentRaw = await (prisma as any).sweepstakesCampaign
      .findMany({
        where: { OR: [{ status: "DRAWN" }, { id: campaign.id }] },
        orderBy: [{ startsAt: "desc" }],
        take: 6,
      })
      .catch(() => [campaign]);

    const recentViews: any[] = [];
    const seen = new Set<string>();
    for (const row of recentRaw || []) {
      const rid = String(row?.id || "");
      if (!rid || seen.has(rid)) continue;
      seen.add(rid);
      recentViews.push(await campaignView(row));
    }

    const current = recentViews.find((v) => String(v?.id || "") === String(campaign?.id || "")) || (await campaignView(campaign));

    return Response.json({
      ok: true,
      enabled: isSweepstakesPublicEnabled(),
      now,
      campaign: current,
      campaigns: recentViews.filter(Boolean),
      prizePools,
      user: userSummary,
    });
  } catch (error: any) {
    return Response.json({ ok: false, error: "Failed to load sweepstakes summary", detail: String(error?.message || error) }, { status: 500 });
  }
}
