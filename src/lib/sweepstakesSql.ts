import { prisma } from '@/lib/prisma';

type DbLike = any;
const dbClient = (db?: DbLike) => db || prisma;

export async function ensureSweepstakesMetaTable(db?: DbLike) {
  const p = dbClient(db);
  await p.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SweepstakesCampaignMeta" (
      "campaignId" TEXT PRIMARY KEY,
      "tokenCost" INTEGER NOT NULL DEFAULT 0,
      "allowTokenEntry" BOOLEAN NOT NULL DEFAULT true,
      "allowGoldenQuestion" BOOLEAN NOT NULL DEFAULT false,
      "prizeValueUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "prizeUrl" TEXT,
      "prizeImageUrl" TEXT,
      "rulesText" TEXT,
      "rulesUrl" TEXT,
      "shortDescription" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function listSweepstakesCampaigns(db?: DbLike): Promise<any[]> {
  const p = dbClient(db);
  const rows = await p.$queryRawUnsafe(`
    SELECT * FROM "SweepstakesCampaign"
    ORDER BY "startsAt" DESC, "createdAt" DESC
  `);
  return Array.isArray(rows) ? rows : [];
}

export async function findSweepstakesCampaignById(id: string, db?: DbLike) {
  const p = dbClient(db);
  const rows = await p.$queryRawUnsafe(`
    SELECT * FROM "SweepstakesCampaign" WHERE "id" = $1 LIMIT 1
  `, id);
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function findSweepstakesCampaignBySlug(slug: string, db?: DbLike) {
  const p = dbClient(db);
  const rows = await p.$queryRawUnsafe(`
    SELECT * FROM "SweepstakesCampaign" WHERE "slug" = $1 LIMIT 1
  `, slug);
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function findActiveSweepstakesCampaign(db?: DbLike) {
  const p = dbClient(db);
  const rows = await p.$queryRawUnsafe(`
    SELECT * FROM "SweepstakesCampaign"
    WHERE "status" = 'ACTIVE'
      AND "isLive" = true
      AND "startsAt" <= CURRENT_TIMESTAMP
      AND "endsAt" >= CURRENT_TIMESTAMP
    ORDER BY "startsAt" DESC
    LIMIT 1
  `);
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function insertSweepstakesCampaign(input: {
  id: string;
  slug: string;
  title: string;
  status: string;
  isLive: boolean;
  startsAt: Date;
  endsAt: Date;
  prizePoolCents: number;
  prizePoolLabel?: string | null;
  termsUrl?: string | null;
}, db?: DbLike) {
  const p = dbClient(db);
  await p.$executeRawUnsafe(`
    INSERT INTO "SweepstakesCampaign"
      ("id", "slug", "title", "status", "isLive", "startsAt", "endsAt", "prizePoolCents", "prizePoolLabel", "termsUrl")
    VALUES
      ($1, $2, $3, CAST($4 AS "SweepstakesCampaignStatus"), $5, $6, $7, $8, $9, $10)
  `,
    input.id,
    input.slug,
    input.title,
    input.status,
    input.isLive,
    input.startsAt,
    input.endsAt,
    input.prizePoolCents,
    input.prizePoolLabel ?? null,
    input.termsUrl ?? null,
  );
  return findSweepstakesCampaignById(input.id, p);
}

export async function updateSweepstakesCampaign(input: {
  id: string;
  title: string;
  status: string;
  isLive: boolean;
  startsAt: Date;
  endsAt: Date;
  prizePoolCents: number;
  prizePoolLabel?: string | null;
  termsUrl?: string | null;
}, db?: DbLike) {
  const p = dbClient(db);
  await p.$executeRawUnsafe(`
    UPDATE "SweepstakesCampaign"
    SET "title" = $2,
        "status" = CAST($3 AS "SweepstakesCampaignStatus"),
        "isLive" = $4,
        "startsAt" = $5,
        "endsAt" = $6,
        "prizePoolCents" = $7,
        "prizePoolLabel" = $8,
        "termsUrl" = $9,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = $1
  `,
    input.id,
    input.title,
    input.status,
    input.isLive,
    input.startsAt,
    input.endsAt,
    input.prizePoolCents,
    input.prizePoolLabel ?? null,
    input.termsUrl ?? null,
  );
  return findSweepstakesCampaignById(input.id, p);
}

export async function updateSweepstakesWinner(input: {
  id: string;
  winnerEntryId: string;
  winnerUserId: string;
  status?: string;
  drawnAt?: Date;
}, db?: DbLike) {
  const p = dbClient(db);
  await p.$executeRawUnsafe(`
    UPDATE "SweepstakesCampaign"
    SET "winnerEntryId" = $2,
        "winnerUserId" = $3,
        "status" = CAST($4 AS "SweepstakesCampaignStatus"),
        "drawnAt" = $5,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = $1
  `,
    input.id,
    input.winnerEntryId,
    input.winnerUserId,
    input.status || 'DRAWN',
    input.drawnAt || new Date(),
  );
}

export async function listRaffleEntriesForCampaign(campaignId: string, db?: DbLike): Promise<any[]> {
  const p = dbClient(db);
  const rows = await p.$queryRawUnsafe(`
    SELECT * FROM "RaffleEntry"
    WHERE "campaignId" = $1
    ORDER BY "createdAt" ASC
  `, campaignId);
  return Array.isArray(rows) ? rows : [];
}

export async function listRaffleEntriesForCampaignWindow(campaignId: string, startsAt: Date, endsAt: Date, db?: DbLike): Promise<any[]> {
  const p = dbClient(db);
  const rows = await p.$queryRawUnsafe(`
    SELECT * FROM "RaffleEntry"
    WHERE "campaignId" = $1 AND "createdAt" >= $2 AND "createdAt" <= $3
    ORDER BY "createdAt" ASC
  `, campaignId, startsAt, endsAt);
  return Array.isArray(rows) ? rows : [];
}
