import { prisma } from "@/lib/prisma";
import { getRequestUserId } from "@/app/api/_lib/authUser";
import { countWeeklyEntries, getOrCreateActiveSweepstakes, RAFFLE_WEEKLY_ENTRY_LIMIT, startOfWeekUtc } from "@/lib/raffle";
import { getPrizePoolSummary } from "@/lib/prizePools";
import { isSweepstakesPublicEnabled } from "@/lib/sweepstakesConfig";

export async function GET(req: Request) {
  try {
    const userId = await getRequestUserId(req);
    const campaign = await getOrCreateActiveSweepstakes(prisma);
    const now = new Date();
    const prizePools = await getPrizePoolSummary(prisma);

    let userSummary = null;
    if (userId) {
      const weekStart = startOfWeekUtc(now);
      const [weeklyCount, sourceBreakdown, campaignCount] = await Promise.all([
        countWeeklyEntries(prisma, userId, weekStart),
        prisma.raffleEntry.groupBy({
          by: ["source"],
          where: { userId, weekStart },
          _sum: { quantity: true },
        }),
        prisma.raffleEntry.aggregate({ where: { userId, campaignId: campaign.id }, _sum: { quantity: true } }),
      ]);
      userSummary = {
        userId,
        weeklyCount,
        campaignEntries: Number(campaignCount._sum.quantity || 0),
        remainingThisWeek: Math.max(0, RAFFLE_WEEKLY_ENTRY_LIMIT - weeklyCount),
        weeklyLimit: RAFFLE_WEEKLY_ENTRY_LIMIT,
        sources: sourceBreakdown.map((row) => ({ source: row.source, quantity: Number(row._sum.quantity || 0) })),
      };
    }

    const campaignTotals = await prisma.raffleEntry.aggregate({
      where: { campaignId: campaign.id },
      _sum: { quantity: true },
      _count: { id: true },
    });

    return Response.json({
      ok: true,
      enabled: isSweepstakesPublicEnabled(),
      campaign: {
        id: campaign.id,
        slug: campaign.slug,
        title: campaign.title,
        status: campaign.status,
        startsAt: campaign.startsAt,
        endsAt: campaign.endsAt,
        prizePoolCents: campaign.prizePoolCents,
        prizePoolLabel: campaign.prizePoolLabel,
        totalEntries: Number(campaignTotals._sum.quantity || 0),
        totalTickets: Number(campaignTotals._count.id || 0),
      },
      prizePools,
      user: userSummary,
      now,
    });
  } catch (error: any) {
    return Response.json({ ok: false, error: "Failed to load sweepstakes summary", detail: String(error?.message || error) }, { status: 500 });
  }
}
