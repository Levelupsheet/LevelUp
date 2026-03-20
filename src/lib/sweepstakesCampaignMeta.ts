import fs from 'fs/promises';
import path from 'path';

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

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'sweepstakes-campaigns.json');

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
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeMeta).filter((r) => r.campaignId) : [];
  } catch {
    return [];
  }
}

export async function writeSweepstakesCampaignMeta(rows: SweepstakesCampaignMeta[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const normalized = (Array.isArray(rows) ? rows : []).map(normalizeMeta).filter((r) => r.campaignId);
  await fs.writeFile(DATA_FILE, JSON.stringify(normalized, null, 2), 'utf8');
}

export async function getSweepstakesCampaignMetaMap() {
  const rows = await readSweepstakesCampaignMeta();
  return new Map(rows.map((row) => [row.campaignId, row]));
}

export async function upsertSweepstakesCampaignMeta(input: SweepstakesCampaignMeta) {
  const rows = await readSweepstakesCampaignMeta();
  const next = normalizeMeta(input);
  const idx = rows.findIndex((r) => r.campaignId === next.campaignId);
  if (idx >= 0) rows[idx] = { ...rows[idx], ...next };
  else rows.push(next);
  await writeSweepstakesCampaignMeta(rows);
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
