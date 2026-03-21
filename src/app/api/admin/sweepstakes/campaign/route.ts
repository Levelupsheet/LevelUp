import { requireAdminRequest } from '@/app/api/_lib/adminGuard';
import { prisma } from '@/lib/prisma';
import { campaignView } from '@/lib/sweepstakesView';
import { mergeCampaignMeta, upsertSweepstakesCampaignMeta, getSweepstakesCampaignMetaMap } from '@/lib/sweepstakesCampaignMeta';
import { listSweepstakesCampaigns, insertSweepstakesCampaign, updateSweepstakesCampaign } from '@/lib/sweepstakesSql';
import crypto from 'crypto';

function parseDate(v: any, fallback?: Date | null) {
  if (!v) return fallback ?? null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback ?? null : d;
}

function slugify(title: string) {
  const base = String(title || 'sweepstakes').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `${base || 'sweepstakes'}-${Date.now().toString().slice(-6)}`;
}

function newId() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `sw_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function GET() {
  const guard = await requireAdminRequest();
  if (!guard.ok) return guard.response;
  try {
    const rows = await listSweepstakesCampaigns(prisma).catch(() => []);
    const metaMap = await getSweepstakesCampaignMetaMap();
    const campaigns = await Promise.all((rows || []).map((row: any) => campaignView(mergeCampaignMeta(row, metaMap.get(String(row.id))))));
    const current = campaigns.find((c: any) => c?.isLive && c?.status === 'ACTIVE') || campaigns[0] || null;
    return Response.json({ ok: true, campaign: current, campaigns });
  } catch (error: any) {
    return Response.json({ ok: false, error: 'Failed to load campaign', detail: String(error?.message || error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const guard = await requireAdminRequest();
  if (!guard.ok) return guard.response;
  try {
    const body = await req.json().catch(() => ({} as any));
    const id = String(body?.id || '').trim();
    const title = String(body?.title || 'New Sweepstakes').trim() || 'New Sweepstakes';
    const prizePoolLabel = String(body?.prizePoolLabel || '').trim() || null;
    const prizeValueUsd = Math.max(0, Number(body?.prizeValueUsd ?? 0) || 0);
    const startsAt = parseDate(body?.startsAt, new Date()) || new Date();
    const endsAt = parseDate(body?.endsAt, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const status = String(body?.status || 'ACTIVE').toUpperCase();
    const isLive = body?.isLive === undefined ? true : Boolean(body.isLive);

    let campaign: any;
    if (id) {
      campaign = await updateSweepstakesCampaign({
        id,
        title,
        prizePoolLabel,
        prizePoolCents: Math.round(prizeValueUsd * 100),
        startsAt,
        endsAt,
        status,
        isLive,
        termsUrl: body?.rulesUrl ? String(body.rulesUrl).trim() : null,
      }, prisma);
    } else {
      campaign = await insertSweepstakesCampaign({
        id: newId(),
        slug: slugify(title),
        title,
        prizePoolLabel,
        prizePoolCents: Math.round(prizeValueUsd * 100),
        startsAt,
        endsAt,
        status,
        isLive,
        termsUrl: body?.rulesUrl ? String(body.rulesUrl).trim() : null,
      }, prisma);
    }

    await upsertSweepstakesCampaignMeta({
      campaignId: String(campaign.id),
      tokenCost: Math.max(0, Number(body?.tokenCost ?? 0) || 0),
      allowTokenEntry: Boolean(body?.allowTokenEntry),
      allowGoldenQuestion: Boolean(body?.allowGoldenQuestion),
      prizeValueUsd,
      prizeUrl: body?.prizeUrl ? String(body.prizeUrl).trim() : undefined,
      prizeImageUrl: body?.prizeImageUrl ? String(body.prizeImageUrl).trim() : undefined,
      rulesText: body?.rulesText ? String(body.rulesText) : undefined,
      rulesUrl: body?.rulesUrl ? String(body.rulesUrl).trim() : undefined,
      shortDescription: body?.shortDescription ? String(body.shortDescription) : undefined,
    });

    const freshRows = await listSweepstakesCampaigns(prisma).catch(() => []);
    const metaMap = await getSweepstakesCampaignMetaMap();
    const campaigns = await Promise.all((freshRows || []).map((row: any) => campaignView(mergeCampaignMeta(row, metaMap.get(String(row.id))))));
    const current = campaigns.find((c: any) => c?.id === String(campaign.id)) || campaigns[0] || null;
    return Response.json({ ok: true, campaign: current, campaigns });
  } catch (error: any) {
    return Response.json({ ok: false, error: 'Failed to update campaign', detail: String(error?.message || error) }, { status: 500 });
  }
}
