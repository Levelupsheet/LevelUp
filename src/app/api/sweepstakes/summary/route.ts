import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/app/api/_lib/authUser';
import { countWeeklyEntries, RAFFLE_WEEKLY_ENTRY_LIMIT, startOfWeekUtc, drawSweepstakesWinner } from '@/lib/raffle';
import { isSweepstakesPublicEnabled } from '@/lib/sweepstakesConfig';
import { campaignView } from '@/lib/sweepstakesView';

export async function GET(req: Request) {
  try {
    const userId = await getRequestUserId(req);
    const now = new Date();
    const rows = await (prisma as any).sweepstakesCampaign.findMany({ orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }] }).catch(() => []);

    for (const row of rows || []) {
      if (row?.status === 'ACTIVE' && row?.endsAt && new Date(row.endsAt) < now && !row?.winnerUserId) {
        await prisma.$transaction(async (tx: any) => {
          const latest = await tx.sweepstakesCampaign.findUnique({ where: { id: row.id } });
          if (latest?.status === 'ACTIVE' && latest?.endsAt && new Date(latest.endsAt) < now && !latest?.winnerUserId) {
            await drawSweepstakesWinner(tx, String(row.id));
          }
        }).catch(() => null);
      }
    }

    const freshRows = await (prisma as any).sweepstakesCampaign.findMany({ orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }] }).catch(() => []);
    const campaigns = await Promise.all((freshRows || []).map((row: any) => campaignView(row)));
    const current = campaigns.find((c: any) => c?.isLive && c?.status === 'ACTIVE') || campaigns.find((c: any) => c?.status === 'ACTIVE') || campaigns[0] || null;

    let userSummary = null;
    if (userId && current) {
      const weekStart = startOfWeekUtc(now);
      const [weeklyCount, sourceBreakdown, campaignCount, wallet] = await Promise.all([
        countWeeklyEntries(prisma, userId, weekStart),
        (prisma as any).raffleEntry.groupBy({ by: ['source'], where: { userId, weekStart }, _sum: { quantity: true } }),
        (prisma as any).raffleEntry.aggregate({ where: { userId, campaignId: current.id }, _sum: { quantity: true } }),
        prisma.wallet.findUnique({ where: { userId } }).catch(() => null),
      ]);
      userSummary = {
        userId,
        weeklyCount,
        campaignEntries: Number(campaignCount?._sum?.quantity || 0),
        remainingThisWeek: Math.max(0, RAFFLE_WEEKLY_ENTRY_LIMIT - weeklyCount),
        weeklyLimit: RAFFLE_WEEKLY_ENTRY_LIMIT,
        tokenBalance: Number(wallet?.tokenBalance || 0),
        sources: Array.isArray(sourceBreakdown) ? sourceBreakdown.map((row: any) => ({ source: row.source, quantity: Number(row._sum?.quantity || 0) })) : [],
      };
    }

    return Response.json({
      ok: true,
      enabled: isSweepstakesPublicEnabled(),
      current,
      campaigns,
      user: userSummary,
      now,
    });
  } catch (error: any) {
    return Response.json({ ok: false, error: 'Failed to load sweepstakes summary', detail: String(error?.message || error) }, { status: 500 });
  }
}
