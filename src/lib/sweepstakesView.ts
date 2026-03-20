import { prisma } from '@/lib/prisma';
import { getSweepstakesCampaignMetaMap, mergeCampaignMeta } from '@/lib/sweepstakesCampaignMeta';

function num(v: any, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

type UserLite = { id: string; displayName?: string | null; email?: string | null };

export async function campaignView(campaign: any) {
  if (!campaign) return null;
  const entries = await (prisma as any).raffleEntry.findMany({
    where: { campaignId: campaign.id },
    orderBy: { createdAt: 'asc' },
  });

  const byUser = new Map<string, { userId: string; quantity: number; tickets: number; lastEntryAt: Date | null }>();
  for (const entry of entries) {
    const key = String(entry.userId || '').trim();
    if (!key) continue;
    const cur = byUser.get(key) || { userId: key, quantity: 0, tickets: 0, lastEntryAt: null };
    cur.quantity += num(entry.quantity, 0);
    cur.tickets += 1;
    cur.lastEntryAt = entry.createdAt ?? cur.lastEntryAt;
    byUser.set(key, cur);
  }

  const userIds = [...byUser.keys()];
  const users: UserLite[] = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true, email: true } })
    : [];
  const userMap = new Map<string, UserLite>(users.map((u) => [String(u.id), u]));

  const leaderboard = [...byUser.values()]
    .map((row) => {
      const user = userMap.get(String(row.userId));
      const displayName =
        (typeof user?.displayName === 'string' && user.displayName.trim()) ||
        (typeof user?.email === 'string' && user.email.trim()) ||
        String(row.userId);
      return {
        userId: row.userId,
        displayName,
        quantity: row.quantity,
        tickets: row.tickets,
        lastEntryAt: row.lastEntryAt,
        isWinner: String(campaign.winnerUserId || '') === String(row.userId),
      };
    })
    .sort((a, b) => b.quantity - a.quantity || new Date(a.lastEntryAt || 0).getTime() - new Date(b.lastEntryAt || 0).getTime())
    .slice(0, 50);

  let winnerUser: UserLite | null = null;
  if (campaign.winnerUserId) {
    winnerUser = userMap.get(String(campaign.winnerUserId)) || (await prisma.user.findUnique({
      where: { id: String(campaign.winnerUserId) },
      select: { id: true, displayName: true, email: true },
    }).catch(() => null));
  }

  const winnerDisplayName =
    (typeof winnerUser?.displayName === 'string' && winnerUser.displayName.trim()) ||
    (typeof winnerUser?.email === 'string' && winnerUser.email.trim()) ||
    (winnerUser?.id ? String(winnerUser.id) : null);

  const metaMap = await getSweepstakesCampaignMetaMap();
  const merged = mergeCampaignMeta(campaign, metaMap.get(String(campaign.id)));

  return {
    ...merged,
    totalEntries: entries.reduce((sum: number, entry: any) => sum + num(entry.quantity, 0), 0),
    totalParticipants: byUser.size,
    winner:
      winnerUser && winnerDisplayName
        ? { userId: winnerUser.id, displayName: winnerDisplayName, drawnAt: campaign.drawnAt }
        : null,
    leaderboard,
  };
}
