import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { ensureSweepstakesCoreTables, findActiveSweepstakesCampaign, findSweepstakesCampaignById, findSweepstakesCampaignBySlug, insertSweepstakesCampaign, listRaffleEntriesForCampaignWindow, updateSweepstakesWinner, listSweepstakesCampaigns } from "@/lib/sweepstakesSql";
import { getSweepstakesCampaignMetaMap, upsertSweepstakesCampaignMeta } from "@/lib/sweepstakesCampaignMeta";

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
  await ensureSweepstakesCoreTables(tx as any);
  const now = new Date();
  const existing = await findActiveSweepstakesCampaign(tx as any);
  if (existing) return existing;

  const start = startOfWeekUtc(now);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);

  const slug = `weekly-${start.toISOString().slice(0, 10)}`;
  const already = await findSweepstakesCampaignBySlug(slug, tx as any);
  const weeklyPool = await tx.prizePool.findUnique({ where: { poolType: "WEEKLY_GOLDEN_POOL" } }).catch(() => null);
  const weeklyPoolCents = Number(weeklyPool?.currentAmount || 0);
  if (already) {
    return insertOrUpdateExistingSweepstakes(already.id, {
      title: `Weekly Sweepstakes ${start.toISOString().slice(0, 10)}`,
      slug,
      status: 'ACTIVE',
      isLive: true,
      startsAt: start,
      endsAt: end,
      prizePoolCents: weeklyPoolCents,
      prizePoolLabel: `$${(weeklyPoolCents / 100).toFixed(2)}`,
    }, tx as any);
  }
  return insertSweepstakesCampaign({
    id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `sw_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    slug,
    title: `Weekly Sweepstakes ${start.toISOString().slice(0, 10)}`,
    status: 'ACTIVE',
    isLive: true,
    startsAt: start,
    endsAt: end,
    prizePoolLabel: `$${(weeklyPoolCents / 100).toFixed(2)}`,
    prizePoolCents: weeklyPoolCents,
  }, tx as any);
}


export async function getOrCreateActiveGoldenSweepstakes(tx: typeof prisma = prisma) {
  await ensureSweepstakesCoreTables(tx as any);
  const now = new Date();
  const rows = await listSweepstakesCampaigns(tx as any).catch(() => [] as any[]);
  const metaMap = await getSweepstakesCampaignMetaMap().catch(() => new Map());
  const activeGolden = (Array.isArray(rows) ? rows : []).find((row: any) => {
    const meta = metaMap.get(String(row?.id || ''));
    return Boolean(meta?.allowGoldenQuestion) && row?.status === 'ACTIVE' && Boolean(row?.isLive) && row?.startsAt && new Date(row.startsAt) <= now && row?.endsAt && new Date(row.endsAt) >= now;
  });
  if (activeGolden) return activeGolden;

  const startsAt = now;
  const endsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const slug = `golden-${now.toISOString().slice(0,10)}-${now.getTime().toString().slice(-6)}`;
  const title = `Golden Sweepstakes ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  const campaign = await insertSweepstakesCampaign({
    id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `sw_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    slug,
    title,
    status: 'ACTIVE',
    isLive: true,
    startsAt,
    endsAt,
    prizePoolCents: 0,
    prizePoolLabel: 'Golden Sweepstakes Entry Draw',
    termsUrl: null,
  }, tx as any);

  await upsertSweepstakesCampaignMeta({
    campaignId: String(campaign.id),
    tokenCost: 0,
    allowTokenEntry: false,
    allowGoldenQuestion: true,
    prizeValueUsd: 0,
    rulesText: 'Golden sweepstakes entries are awarded from qualifying golden questions. One golden question entry per eligible session/level rules.',
    shortDescription: 'Auto-created golden question draw',
  }).catch(() => null);

  return campaign;
}
async function insertOrUpdateExistingSweepstakes(id: string, input: { title: string; slug?: string; status: string; isLive: boolean; startsAt: Date; endsAt: Date; prizePoolCents: number; prizePoolLabel?: string | null; }, tx: any) {
  await tx.$executeRawUnsafe(`
    UPDATE "SweepstakesCampaign"
    SET "title" = $2,
        "status" = CAST($3 AS "SweepstakesCampaignStatus"),
        "isLive" = $4,
        "startsAt" = $5,
        "endsAt" = $6,
        "prizePoolCents" = $7,
        "prizePoolLabel" = $8,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = $1
  `, id, input.title, input.status, input.isLive, input.startsAt, input.endsAt, input.prizePoolCents, input.prizePoolLabel ?? null);
  return findSweepstakesCampaignById(id, tx as any);
}

export async function countWeeklyEntries(tx: typeof prisma = prisma, userId: string, weekStart = startOfWeekUtc(new Date()), campaignId?: string | null) {
  await ensureSweepstakesCoreTables(tx as any);
  const rows = (await tx.$queryRawUnsafe(`
    SELECT COALESCE(SUM("quantity"), 0) AS "total"
    FROM "RaffleEntry"
    WHERE "userId" = $1 AND "weekStart" = $2
      AND ($3::text IS NULL OR "campaignId" = $3)
  `, userId, weekStart, campaignId || null)) as any[];
  return Number(rows?.[0]?.total || 0);
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
  await ensureSweepstakesCoreTables(tx as any);
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
    ? await findSweepstakesCampaignById(input.campaignId, tx as any)
    : await getOrCreateActiveSweepstakes(tx as any);

  await tx.$executeRawUnsafe(`
    INSERT INTO "RaffleEntry"
      ("id", "userId", "source", "quantity", "weekStart", "campaignId", "meta", "sourceRefType", "sourceRefId", "auditKey", "createdAt")
    VALUES ($1,$2,CAST($3 AS "RaffleEntrySource"),$4,$5,$6,CAST($7 AS JSONB),CAST($8 AS "RaffleSourceRefType"),$9,$10,$11)
  `,
    typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `re_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    input.userId,
    input.source,
    awarded,
    weekStart,
    campaign?.id || null,
    JSON.stringify(input.meta || null),
    input.sourceRefType || null,
    input.sourceRefId || null,
    input.auditKey || null,
    createdAt
  );

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
  const campaign = await findSweepstakesCampaignById(campaignId, tx as any);
  if (!campaign) throw new Error("Sweepstakes campaign not found");

  if (campaign.winnerUserId) {
    const existingWinner = await tx.$queryRawUnsafe(
      `SELECT * FROM "RaffleEntry" WHERE "id" = $1 LIMIT 1`,
      campaign.winnerEntryId || null
    ).catch(() => [] as any[]);
    return Array.isArray(existingWinner) ? existingWinner[0] || null : null;
  }

  const entries = await listRaffleEntriesForCampaignWindow(campaignId, campaign.startsAt, campaign.endsAt, tx as any);
  const weighted: typeof entries = [];
  for (const entry of entries) {
    const qty = Math.max(1, Math.floor(Number(entry.quantity || 1)));
    for (let i = 0; i < qty; i += 1) weighted.push(entry);
  }
  if (!weighted.length) return null;

  const winner = weighted[Math.floor(Math.random() * weighted.length)];
  await updateSweepstakesWinner({
    id: campaignId,
    winnerEntryId: winner.id,
    winnerUserId: winner.userId,
    status: 'DRAWN',
    drawnAt: new Date(),
  }, tx as any);

  try {
    const user = await tx.user.findUnique({ where: { id: winner.userId }, select: { displayName: true, email: true } });
    const displayName = String(user?.displayName || user?.email || 'there');
    const title = `Sweepstakes winner selected: ${campaign.title}`;
    const body = `Congrats ${displayName}! You were selected as the winner for ${campaign.prizePoolLabel || campaign.title}. Please check with the admin team for prize fulfillment details.`;
    const existing = await tx.notification.findFirst({
      where: { userId: winner.userId, type: 'LOOT_BOX_EARNED', title, readAt: null },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);
    if (!existing) {
      await tx.notification.create({
        data: {
          userId: winner.userId,
          type: 'LOOT_BOX_EARNED',
          title,
          body,
        },
      }).catch(() => null);
    }
  } catch {}

  return winner;
}
