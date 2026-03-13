import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export const SUBSCRIPTION_POOL_CONTRIBUTION_BPS = 1500; // 15%

export function centsLabel(cents: number) {
  return `$${(Math.max(0, Number(cents || 0)) / 100).toFixed(2)}`;
}

export async function ensurePrizePools(tx: typeof prisma = prisma) {
  const poolTypes = ["WEEKLY_GOLDEN_POOL", "LEADERBOARD_POOL", "MONTHLY_GRAND_POOL"] as const;
  await Promise.all(poolTypes.map((poolType) => tx.prizePool.upsert({
    where: { poolType },
    update: {},
    create: { poolType, currentAmount: 0 },
  })));
}

export async function getPrizePoolSummary(tx: typeof prisma = prisma) {
  await ensurePrizePools(tx);
  const pools = await tx.prizePool.findMany({ orderBy: { createdAt: "asc" } });
  const byType = Object.fromEntries(pools.map((pool) => [pool.poolType, {
    id: pool.id,
    poolType: pool.poolType,
    currentAmount: Number(pool.currentAmount || 0),
    label: centsLabel(Number(pool.currentAmount || 0)),
    updatedAt: pool.updatedAt,
  }]));
  return byType;
}

export async function applySubscriptionContribution(
  tx: typeof prisma,
  input: { amountPaidCents: number; percentBps?: number; eventId?: string | null },
) {
  const amountPaidCents = Math.max(0, Math.floor(Number(input.amountPaidCents || 0)));
  const percentBps = Math.max(0, Math.floor(Number(input.percentBps || SUBSCRIPTION_POOL_CONTRIBUTION_BPS)));
  const contributionCents = Math.floor((amountPaidCents * percentBps) / 10000);

  await ensurePrizePools(tx);
  const weeklyPool = await tx.prizePool.upsert({
    where: { poolType: "WEEKLY_GOLDEN_POOL" },
    update: { currentAmount: { increment: contributionCents } },
    create: { poolType: "WEEKLY_GOLDEN_POOL", currentAmount: contributionCents },
  });

  const activeCampaign = await tx.sweepstakesCampaign.findFirst({
    where: { status: "ACTIVE", startsAt: { lte: new Date() }, endsAt: { gte: new Date() } },
    orderBy: { startsAt: "desc" },
  });

  if (activeCampaign) {
    await tx.sweepstakesCampaign.update({
      where: { id: activeCampaign.id },
      data: {
        prizePoolCents: Number(weeklyPool.currentAmount || 0),
        prizePoolLabel: centsLabel(Number(weeklyPool.currentAmount || 0)),
      },
    });
  }

  return {
    amountPaidCents,
    percentBps,
    contributionCents,
    poolType: "WEEKLY_GOLDEN_POOL" as const,
    newPoolAmount: Number(weeklyPool.currentAmount || 0),
  };
}

export function verifyStripeWebhookSignature(payload: string, signatureHeader: string | null, secret: string) {
  if (!secret) return { ok: false, reason: "missing_webhook_secret" };
  if (!signatureHeader) return { ok: false, reason: "missing_signature_header" };

  const parts = Object.fromEntries(signatureHeader.split(",").map((part) => {
    const [k, v] = part.split("=");
    return [k, v];
  }));
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return { ok: false, reason: "invalid_signature_header" };

  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(v1);
  const ok = left.length === right.length && crypto.timingSafeEqual(left, right);
  return { ok, reason: ok ? null : "signature_mismatch" };
}
