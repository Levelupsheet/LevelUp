import { requireAdminRequest } from "@/app/api/_lib/adminGuard";
import { prisma } from "@/lib/prisma";
import { drawSweepstakesWinner, getOrCreateActiveSweepstakes } from "@/lib/raffle";
import { findSweepstakesCampaignById } from "@/lib/sweepstakesSql";

export async function POST(req: Request) {
  const guard = await requireAdminRequest();
  if (!guard.ok) return guard.response;

  try {
    const body = await req.json().catch(() => ({} as any));
    const campaignId = String(body?.campaignId || "").trim();

    const result = await prisma.$transaction(async (tx) => {
      const campaign = campaignId
        ? await findSweepstakesCampaignById(campaignId, tx as any)
        : await getOrCreateActiveSweepstakes(tx as any);
      if (!campaign) throw new Error("Sweepstakes campaign not found");

      const winner = await drawSweepstakesWinner(tx as any, campaign.id);
      if (!winner) {
        return { campaign, winner: null };
      }

      const user = await tx.user.findUnique({ where: { id: winner.userId }, select: { id: true, email: true, displayName: true } });
      return { campaign: await findSweepstakesCampaignById(campaign.id, tx as any), winner: { ...winner, user } };
    });

    // `result` may not be inferred as an object type; merge safely with Object.assign
    return Response.json(Object.assign({ ok: true }, result as any));
  } catch (error: any) {
    return Response.json({ ok: false, error: "Failed to draw sweepstakes winner", detail: String(error?.message || error) }, { status: 500 });
  }
}
