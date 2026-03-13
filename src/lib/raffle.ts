import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export const RAFFLE_WEEKLY_ENTRY_LIMIT = 5;

export type AwardableRaffleSource = "GOLDEN_QUESTION" | "GOLDEN_BOSS" | "BOSS_BATTLE" | "CHEST_REWARD" | "FREE_ENTRY";
export type RaffleSourceRefType = "QUESTION" | "SESSION" | "BOSS_ENCOUNTER" | "LOOT_BOX" | "FREE_ENTRY_SUBMISSION" | "MANUAL_ADJUSTMENT";
export const FREE_ENTRY_TOKEN_HOURS = 24;

export function startOfWeekUtc(date = new Date()) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export function createVerificationToken() {
  return crypto.randomBytes(24).toString("hex");
}

export function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export async function getOrCreateActiveSweepstakes(tx: typeof prisma = prisma) {
  const now = new Date();
  const existing = await tx.sweepstakesCampaign.findFirst({
    where: {
      status: "ACTIVE",
      isLive: true,
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    orderBy: { startsAt: "desc" },
  });
  if (existing) return existing;

  const start = startOfWeekUtc(now);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);

  const slug = `weekly-${start.toISOString().slice(0, 10)}`;
  const weeklyPool = await tx.prizePool.findUnique({ where: { poolType: "WEEKLY_GOLDEN_POOL" } }).catch(() => null);
  const weeklyPoolCents = Number(weeklyPool?.currentAmount || 0);
  return tx.sweepstakesCampaign.upsert({
    where: { slug },
    update: { status: "ACTIVE", isLive: true, startsAt: start, endsAt: end, prizePoolCents: weeklyPoolCents, prizePoolLabel: `$${(weeklyPoolCents / 100).toFixed(2)}` },
    create: {
      slug,
      title: `Weekly Sweepstakes ${start.toISOString().slice(0, 10)}`,
      status: "ACTIVE",
      isLive: true,
      startsAt: start,
      endsAt: end,
      prizePoolLabel: `$${(weeklyPoolCents / 100).toFixed(2)}`,
      prizePoolCents: weeklyPoolCents,
    },
  });
}

export async function countWeeklyEntries(tx: typeof prisma = prisma, userId: string, weekStart = startOfWeekUtc(new Date()), campaignId?: string | null) {
  const row = await tx.raffleEntry.aggregate({
    where: { userId, weekStart, ...(campaignId ? { campaignId } : {}) },
    _sum: { quantity: true },
  });
  return Number(row._sum.quantity || 0);
}

export async function awardRaffleEntries(
  tx: typeof prisma,
  input: {
    userId: string;
    source: AwardableRaffleSource;
    quantity?: number;
    meta?: Record<string, any> | null;
    campaignId?: string | null;
    createdAt?: Date;
    sourceRefType?: RaffleSourceRefType | null;
    sourceRefId?: string | null;
    auditKey?: string | null;
  },
) {
  const quantityRequested = Math.max(0, Math.floor(Number(input.quantity || 0)));
  if (!input.userId || quantityRequested <= 0) {
    return { awarded: 0, capped: false, remaining: RAFFLE_WEEKLY_ENTRY_LIMIT };
  }

  const createdAt = input.createdAt || new Date();
  const weekStart = startOfWeekUtc(createdAt);
  const existing = await countWeeklyEntries(tx, input.userId, weekStart, input.campaignId || undefined);
  const remaining = Math.max(0, RAFFLE_WEEKLY_ENTRY_LIMIT - existing);
  const awarded = Math.min(quantityRequested, remaining);
  if (awarded <= 0) {
    return { awarded: 0, capped: true, remaining };
  }

  const campaign = input.campaignId
    ? await tx.sweepstakesCampaign.findUnique({ where: { id: input.campaignId } })
    : await getOrCreateActiveSweepstakes(tx);

  await tx.raffleEntry.create({
    data: {
      userId: input.userId,
      source: input.source,
      quantity: awarded,
      weekStart,
      campaignId: campaign?.id || null,
      meta: (input.meta || null) as any,
      sourceRefType: input.sourceRefType || undefined,
      sourceRefId: input.sourceRefId || undefined,
      auditKey: input.auditKey || undefined,
      createdAt,
    },
  });

  return { awarded, capped: awarded < quantityRequested, remaining: Math.max(0, remaining - awarded), campaignId: campaign?.id || null };
}

export async function verifyCaptchaToken(token: string, remoteip?: string | null) {
  const secret = process.env.TURNSTILE_SECRET_KEY || process.env.CAPTCHA_SECRET_KEY || "";
  if (!secret) {
    const allowDev = process.env.NODE_ENV !== "production" && token === "dev-pass";
    return { ok: allowDev, provider: allowDev ? "development" : "unconfigured", score: allowDev ? 1 : 0 };
  }

  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    if (remoteip) body.set("remoteip", remoteip);

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });
    const json = await response.json().catch(() => ({}));
    return {
      ok: Boolean(json?.success),
      provider: "turnstile",
      score: Number(json?.score || 0),
      detail: json,
    };
  } catch (error) {
    return { ok: false, provider: "turnstile", score: 0, detail: String(error) };
  }
}

export function buildVerificationUrl(token: string) {
  const base = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/sweepstakes/free-entry/verify?token=${encodeURIComponent(token)}`;
}

export async function drawSweepstakesWinner(tx: typeof prisma, campaignId: string) {
  const campaign = await tx.sweepstakesCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Sweepstakes campaign not found");

  const entries = await tx.raffleEntry.findMany({
    where: {
      campaignId,
      createdAt: { gte: campaign.startsAt, lte: campaign.endsAt },
    },
    orderBy: { createdAt: "asc" },
  });

  const weighted: typeof entries = [];
  for (const entry of entries) {
    const qty = Math.max(1, Math.floor(Number(entry.quantity || 1)));
    for (let i = 0; i < qty; i += 1) weighted.push(entry);
  }
  if (!weighted.length) return null;

  const winner = weighted[Math.floor(Math.random() * weighted.length)];
  await tx.sweepstakesCampaign.update({
    where: { id: campaignId },
    data: {
      status: "DRAWN",
      winnerEntryId: winner.id,
      winnerUserId: winner.userId,
      drawnAt: new Date(),
    },
  });

  return winner;
}
