import { requireAdminRequest } from "@/app/api/_lib/adminGuard";
import { prisma } from "@/lib/prisma";
import { getOrCreateActiveSweepstakes } from "@/lib/raffle";
import { getPrizePoolSummary } from "@/lib/prizePools";

export async function GET() {
  const guard = await requireAdminRequest();
  if (!guard.ok) return guard.response;
  try {
    const [campaign, prizePools] = await Promise.all([
      getOrCreateActiveSweepstakes(prisma),
      getPrizePoolSummary(prisma),
    ]);
    return Response.json({ ok: true, campaign, prizePools });
  } catch (error: any) {
    return Response.json({ ok: false, error: "Failed to load campaign", detail: String(error?.message || error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const guard = await requireAdminRequest();
  if (!guard.ok) return guard.response;
  try {
    const body = await req.json().catch(() => ({} as any));
    const campaign = await getOrCreateActiveSweepstakes(prisma);
    const nextPrizePoolCents = Number.isFinite(Number(body?.prizePoolCents)) ? Math.max(0, Math.floor(Number(body.prizePoolCents))) : campaign.prizePoolCents;

    const [next] = (await prisma.$transaction([
      prisma.sweepstakesCampaign.update({
        where: { id: campaign.id },
        data: {
          title: typeof body?.title === "string" && body.title.trim() ? body.title.trim() : campaign.title,
          prizePoolCents: nextPrizePoolCents,
          prizePoolLabel: typeof body?.prizePoolLabel === "string" ? body.prizePoolLabel.trim() : campaign.prizePoolLabel,
          termsUrl: typeof body?.termsUrl === "string" ? body.termsUrl.trim() || null : campaign.termsUrl,
        },
      }),
      prisma.prizePool.upsert({
        where: { poolType: "WEEKLY_GOLDEN_POOL" },
        update: { currentAmount: nextPrizePoolCents },
        create: { poolType: "WEEKLY_GOLDEN_POOL", currentAmount: nextPrizePoolCents },
      }),
    ])) as any[];
    const prizePools = await getPrizePoolSummary(prisma);
    return Response.json({ ok: true, campaign: next, prizePools });
  } catch (error: any) {
    return Response.json({ ok: false, error: "Failed to update campaign", detail: String(error?.message || error) }, { status: 500 });
  }
}
