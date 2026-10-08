import { PrismaClient } from '@prisma/client';
import { capXpForTier, getSubscriptionTierByEmail } from '@/lib/subscriptions';
import { reconcileLevelLoot } from '@/lib/levelLoot';
import { isAdminEmail } from '@/lib/adminAuth';

function rewardTier(user: any) {
  if (isAdminEmail(user.email)) return 'PREMIUM' as const;
  const tier = String(user.subscriptionTier || '').toUpperCase();
  if (!tier) return getSubscriptionTierByEmail(user.email);
  const expires = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt).getTime() : Infinity;
  return user.subscriptionStatus === 'ACTIVE' && expires > Date.now() && (tier === 'PRO' || tier === 'PREMIUM') ? tier : 'FREE';
}

export async function applyUserXpIncrement(prisma: any, userId: string, increment: number) {
  if (typeof prisma.$transaction === 'function') return prisma.$transaction((tx: any) => applyUserXpIncrement(tx,userId,increment));
  await prisma.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, xp: true, email: true, subscriptionTier: true, subscriptionStatus: true, subscriptionExpiresAt: true } });
  if (!user) throw new Error('User not found');
  const tier = rewardTier(user);
  const nextXp = Math.max(user.xp || 0, capXpForTier((user.xp || 0) + Math.max(0, Math.floor(increment || 0)), tier));
  const updated = await prisma.user.update({ where: { id: userId }, data: { xp: nextXp, lastActiveAt: new Date() } });
  const loot = await reconcileLevelLoot(prisma,userId);
  return { ...updated, levelRewardsCreated: loot.created };
}

export async function syncUserXpUpward(prisma: any, userId: string, xpAfter: number) {
  if (typeof prisma.$transaction === 'function') return prisma.$transaction((tx: any) => syncUserXpUpward(tx,userId,xpAfter));
  await prisma.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, xp: true, email: true, subscriptionTier: true, subscriptionStatus: true, subscriptionExpiresAt: true } });
  if (!user) throw new Error('User not found');
  const tier = rewardTier(user);
  const nextXp = Math.max(user.xp || 0, capXpForTier(Math.max(user.xp || 0, Math.floor(xpAfter || 0)), tier));
  const updated = nextXp === (user.xp || 0) ? user : await prisma.user.update({ where: { id: userId }, data: { xp: nextXp } });
  await reconcileLevelLoot(prisma,userId);
  return updated;
}
