import { PrismaClient } from '@prisma/client';
import { capXpForTier, getSubscriptionTierByEmail } from '@/lib/subscriptions';

export async function applyUserXpIncrement(prisma: any, userId: string, increment: number) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, xp: true, email: true } });
  if (!user) throw new Error('User not found');
  const tier = getSubscriptionTierByEmail(user.email);
  const nextXp = capXpForTier((user.xp || 0) + Math.max(0, Math.floor(increment || 0)), tier);
  return prisma.user.update({ where: { id: userId }, data: { xp: nextXp, lastActiveAt: new Date() } });
}

export async function syncUserXpUpward(prisma: any, userId: string, xpAfter: number) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, xp: true, email: true } });
  if (!user) throw new Error('User not found');
  const tier = getSubscriptionTierByEmail(user.email);
  const nextXp = capXpForTier(Math.max(user.xp || 0, Math.floor(xpAfter || 0)), tier);
  if (nextXp === (user.xp || 0)) return user;
  return prisma.user.update({ where: { id: userId }, data: { xp: nextXp } });
}
