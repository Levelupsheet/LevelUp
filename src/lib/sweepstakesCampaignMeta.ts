import { prisma } from '@/lib/prisma';
import { ensureSweepstakesMetaTable } from '@/lib/sweepstakesSql';

export type SweepstakesCampaignMeta = {
  campaignId: string;
  tokenCost?: number;
  allowTokenEntry?: boolean;
  allowGoldenQuestion?: boolean;
  prizeValueUsd?: number;
  prizeUrl?: string;
  prizeImageUrl?: string;
  rulesText?: string;
  rulesUrl?: string;
  shortDescription?: string;
};

function normalizeMeta(row: any): SweepstakesCampaignMeta {
  return {
    campaignId: String(row?.campaignId || '').trim(),
    tokenCost: Math.max(0, Number(row?.tokenCost ?? 0) || 0),
    allowTokenEntry: row?.allowTokenEntry === undefined ? true : Boolean(row.allowTokenEntry),
    allowGoldenQuestion: Boolean(row?.allowGoldenQuestion),
    prizeValueUsd: Math.max(0, Number(row?.prizeValueUsd ?? 0) || 0),
    prizeUrl: row?.prizeUrl ? String(row.prizeUrl).trim() : undefined,
    prizeImageUrl: row?.prizeImageUrl ? String(row.prizeImageUrl).trim() : undefined,
    rulesText: row?.rulesText ? String(row.rulesText) : undefined,
    rulesUrl: row?.rulesUrl ? String(row.rulesUrl).trim() : undefined,
    shortDescription: row?.shortDescription ? String(row.shortDescription) : undefined,
  };
}

export async function readSweepstakesCampaignMeta(): Promise<SweepstakesCampaignMeta[]> {
  try {
    await ensureSweepstakesMetaTable(prisma);
    const rows = (await prisma.$queryRawUnsafe(`
      SELECT * FROM "SweepstakesCampaignMeta"
      ORDER BY "updatedAt" DESC, "createdAt" DESC
    `)) as any[];
    return Array.isArray(rows) ? rows.map(normalizeMeta).filter((r) => r.campaignId) : [];
  } catch {
    return [];
  }
}

export async function writeSweepstakesCampaignMeta(rows: SweepstakesCampaignMeta[]) {
  await ensureSweepstakesMetaTable(prisma);
  const normalized = (Array.isArray(rows) ? rows : []).map(normalizeMeta).filter((r) => r.campaignId);
  await prisma.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(`DELETE FROM "SweepstakesCampaignMeta"`);
    for (const row of normalized) {
      await tx.$executeRawUnsafe(`
        INSERT INTO "SweepstakesCampaignMeta"
          ("campaignId", "tokenCost", "allowTokenEntry", "allowGoldenQuestion", "prizeValueUsd", "prizeUrl", "prizeImageUrl", "rulesText", "rulesUrl", "shortDescription")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `,
        row.campaignId,
        Math.max(0, Number(row.tokenCost ?? 0) || 0),
        row.allowTokenEntry === undefined ? true : Boolean(row.allowTokenEntry),
        Boolean(row.allowGoldenQuestion),
        Math.max(0, Number(row.prizeValueUsd ?? 0) || 0),
        row.prizeUrl ?? null,
        row.prizeImageUrl ?? null,
        row.rulesText ?? null,
        row.rulesUrl ?? null,
        row.shortDescription ?? null,
      );
    }
  });
}

export async function getSweepstakesCampaignMetaMap() {
  const rows = await readSweepstakesCampaignMeta();
  return new Map(rows.map((row) => [row.campaignId, row]));
}

export async function upsertSweepstakesCampaignMeta(input: SweepstakesCampaignMeta) {
  await ensureSweepstakesMetaTable(prisma);
  const next = normalizeMeta(input);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "SweepstakesCampaignMeta"
      ("campaignId", "tokenCost", "allowTokenEntry", "allowGoldenQuestion", "prizeValueUsd", "prizeUrl", "prizeImageUrl", "rulesText", "rulesUrl", "shortDescription")
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT ("campaignId") DO UPDATE SET
      "tokenCost" = EXCLUDED."tokenCost",
      "allowTokenEntry" = EXCLUDED."allowTokenEntry",
      "allowGoldenQuestion" = EXCLUDED."allowGoldenQuestion",
      "prizeValueUsd" = EXCLUDED."prizeValueUsd",
      "prizeUrl" = EXCLUDED."prizeUrl",
      "prizeImageUrl" = EXCLUDED."prizeImageUrl",
      "rulesText" = EXCLUDED."rulesText",
      "rulesUrl" = EXCLUDED."rulesUrl",
      "shortDescription" = EXCLUDED."shortDescription",
      "updatedAt" = CURRENT_TIMESTAMP
  `,
    next.campaignId,
    Math.max(0, Number(next.tokenCost ?? 0) || 0),
    next.allowTokenEntry === undefined ? true : Boolean(next.allowTokenEntry),
    Boolean(next.allowGoldenQuestion),
    Math.max(0, Number(next.prizeValueUsd ?? 0) || 0),
    next.prizeUrl ?? null,
    next.prizeImageUrl ?? null,
    next.rulesText ?? null,
    next.rulesUrl ?? null,
    next.shortDescription ?? null,
  );
  return next;
}

export function mergeCampaignMeta(campaign: any, meta?: SweepstakesCampaignMeta | null) {
  const prizeValueUsd = meta?.prizeValueUsd ?? Math.max(0, Number(campaign?.prizePoolCents || 0) / 100);
  return {
    ...campaign,
    tokenCost: Math.max(0, Number(meta?.tokenCost ?? 0) || 0),
    allowTokenEntry: meta?.allowTokenEntry === undefined ? true : Boolean(meta.allowTokenEntry),
    allowGoldenQuestion: Boolean(meta?.allowGoldenQuestion),
    prizeValueUsd,
    prizeUrl: meta?.prizeUrl || null,
    prizeImageUrl: meta?.prizeImageUrl || null,
    rulesText: meta?.rulesText || '',
    rulesUrl: meta?.rulesUrl || null,
    shortDescription: meta?.shortDescription || '',
  };
}
