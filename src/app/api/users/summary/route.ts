import { prisma } from "../../_lib/prisma";
import { ensureUser } from "../../_lib/ensureUser";
import { getRequestUserId } from "../../_lib/authUser";
import { capXpForTier, getSubscriptionMetaByEmail, getSubscriptionTierByEmail } from "@/lib/subscriptions";

export async function GET(req: Request) {
  try {
    const userId = await getRequestUserId(req);
    if (!userId) return Response.json({ ok: false, error: "userId required" }, { status: 400 });

    let user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      user = await ensureUser(userId);
    }

    const subscriptionTier = getSubscriptionTierByEmail(user.email);
    const subscriptionMeta = getSubscriptionMetaByEmail(user.email);
    const cappedXp = capXpForTier(user.xp, subscriptionTier);
    if (cappedXp !== user.xp) {
      user = await prisma.user.update({ where: { id: userId }, data: { xp: cappedXp } });
    }

    const [notifications, badges, offers] = await Promise.all([
      prisma.notification.findMany({ where: { userId, readAt: null }, orderBy: { createdAt: "desc" }, take: 20 }),
      prisma.badge.findMany({ where: { userId }, orderBy: { issuedAt: "desc" }, take: 20 }),
      prisma.mockOffer.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10 }),
    ]);

    const wallet = await prisma.wallet.upsert({ where: { userId }, update: {}, create: { userId, tokenBalance: 0 } });

    return Response.json({
      ok: true,
      user: {
        id: user.id,
        xp: user.xp,
        tokenBalance: wallet.tokenBalance,
        rank: (user as any).rank ?? "STUDENT",
        drawingEligibleUntil: (user as any).drawingEligibleUntil ?? null,
        startingPosition: user.startingPosition,
        moduleChoice: user.moduleChoice,
        subscriptionTier,
      subscriptionStatus: subscriptionMeta?.status || (subscriptionTier === 'FREE' ? 'FREE' : 'ACTIVE'),
      subscriptionExpiresAt: subscriptionMeta?.expiresAt || null,
        subscriptionStatus: subscriptionMeta?.status || (subscriptionTier === 'FREE' ? 'FREE' : 'ACTIVE'),
        subscriptionExpiresAt: subscriptionMeta?.expiresAt || null,
      },
      xp: user.xp,
      tokenBalance: wallet.tokenBalance,
      subscriptionTier,
      subscriptionStatus: subscriptionMeta?.status || (subscriptionTier === 'FREE' ? 'FREE' : 'ACTIVE'),
      subscriptionExpiresAt: subscriptionMeta?.expiresAt || null,
      notifications,
      badges,
      offers,
    });
  } catch (err: any) {
    const message = err?.message ?? "Internal error";
    return Response.json({ ok: false, error: "Failed to load user summary", detail: message }, { status: 500 });
  }
}
