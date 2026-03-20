import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/app/api/_lib/authUser';
import { awardRaffleEntries } from '@/lib/raffle';
import { getSweepstakesCampaignMetaMap } from '@/lib/sweepstakesCampaignMeta';

export async function POST(req: Request) {
  try {
    const userId = String((await getRequestUserId(req)) || '').trim();
    if (!userId) return Response.json({ ok: false, error: 'Sign in required' }, { status: 401 });
    const body = await req.json().catch(() => ({} as any));
    const campaignId = String(body?.campaignId || '').trim();
    const quantity = Math.max(1, Math.min(50, Number(body?.quantity || 1) || 1));
    if (!campaignId) return Response.json({ ok: false, error: 'campaignId required' }, { status: 400 });

    const campaign = await (prisma as any).sweepstakesCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) return Response.json({ ok: false, error: 'Campaign not found' }, { status: 404 });
    const now = new Date();
    if (!campaign.isLive || campaign.status !== 'ACTIVE' || new Date(campaign.startsAt) > now || new Date(campaign.endsAt) < now) {
      return Response.json({ ok: false, error: 'Campaign is not accepting entries right now' }, { status: 400 });
    }

    const metaMap = await getSweepstakesCampaignMetaMap();
    const meta = metaMap.get(campaignId);
    const tokenCost = Math.max(0, Number(meta?.tokenCost ?? 0) || 0);
    if (!meta?.allowTokenEntry || tokenCost <= 0) {
      return Response.json({ ok: false, error: 'This drawing does not accept token entries' }, { status: 400 });
    }

    const totalCost = tokenCost * quantity;
    const result = (await prisma.$transaction(async (tx: any): Promise<{ award: any }> => {
      const wallet = (await tx.wallet.findUnique({ where: { userId } }).catch(() => null)) || { tokenBalance: 0 };
      const balance = Number(wallet?.tokenBalance || 0);
      if (balance < totalCost) throw new Error('Not enough tokens');

      await tx.wallet.upsert({
        where: { userId },
        update: { tokenBalance: { decrement: totalCost } },
        create: { userId, tokenBalance: 0 },
      });

      const award = await awardRaffleEntries(tx as any, {
        userId,
        source: 'CHEST_REWARD',
        quantity,
        campaignId,
        sourceRefType: 'MANUAL_ADJUSTMENT',
        sourceRefId: `token-entry:${campaignId}`,
        auditKey: `token-entry:${campaignId}:${userId}:${Date.now()}:${Math.random().toString(36).slice(2,8)}`,
        meta: { tokenCost, totalCost, entryMethod: 'TOKEN' } as any,
      });

      return { award };
    })) as { award: any };

    const wallet = await prisma.wallet.findUnique({ where: { userId } }).catch(() => null);
    return Response.json({ ok: true, awarded: result.award.awarded, tokenBalance: Number(wallet?.tokenBalance || 0) });
  } catch (error: any) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
}
