import { prisma } from "../../_lib/prisma";
import { ensureUser } from "../../_lib/ensureUser";
import { getRequestUserId } from "../../_lib/authUser";
import {
  capXpForTier,
  downgradeSubscriptionByEmail,
  getSubscriptionMetaByEmail,
  getSubscriptionTierByEmail,
  setSubscriptionMetaByEmail,
  setSubscriptionTierByEmail,
} from "@/lib/subscriptions";

export async function GET(req: Request) {
  try {
    const userId = await getRequestUserId(req);
    if (!userId) {
      return Response.json({ ok: false, error: "userId required" }, { status: 400 });
    }

    let user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) user = await ensureUser(userId);

    const fileTier = getSubscriptionTierByEmail(user.email);
    const fileMeta = getSubscriptionMetaByEmail(user.email);

    let subscriptionTier = String((user as any).subscriptionTier || fileTier || "FREE").toUpperCase();
    let subscriptionStatus = String((user as any).subscriptionStatus || fileMeta?.status || (subscriptionTier === "FREE" ? "FREE" : "ACTIVE")).toUpperCase();
    let subscriptionExpiresAt = (user as any).subscriptionExpiresAt || fileMeta?.expiresAt || null;

    const expiryMs = subscriptionExpiresAt ? new Date(subscriptionExpiresAt).getTime() : 0;
    if (subscriptionTier !== "FREE" && Number.isFinite(expiryMs) && expiryMs > 0 && Date.now() > expiryMs) {
      subscriptionTier = "FREE";
      subscriptionStatus = "EXPIRED";
      subscriptionExpiresAt = new Date(expiryMs).toISOString();
      try {
        user = await prisma.user.update({
          where: { id: userId },
          data: {
            subscriptionTier: "FREE",
            subscriptionStatus: "EXPIRED",
            subscriptionExpiresAt: new Date(expiryMs),
          } as any,
        });
      } catch {}
      downgradeSubscriptionByEmail(user.email, 'EXPIRED');
    } else {
      // keep file/meta and DB aligned on reads
      if (user.email) {
        setSubscriptionTierByEmail(user.email, subscriptionTier as any);
        setSubscriptionMetaByEmail(user.email, {
          tier: subscriptionTier as any,
          status: (subscriptionStatus as any),
          expiresAt: subscriptionExpiresAt ? new Date(subscriptionExpiresAt).toISOString() : null,
          paypalSubscriptionId: (user as any).paypalSubscriptionId || fileMeta?.paypalSubscriptionId || null,
          paypalPlanId: (user as any).paypalPlanId || fileMeta?.paypalPlanId || null,
          startedAt: (user as any).subscriptionStartedAt ? new Date((user as any).subscriptionStartedAt).toISOString() : fileMeta?.startedAt || null,
        });
      }
    }

    const cappedXp = capXpForTier(user.xp, subscriptionTier as any);
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
        subscriptionStatus,
        subscriptionExpiresAt,
      },
      xp: user.xp,
      tokenBalance: wallet.tokenBalance,
      subscriptionTier,
      subscriptionStatus,
      subscriptionExpiresAt,
      notifications,
      badges,
      offers,
    });
  } catch (err: any) {
    const message = err?.message ?? "Internal error";
    return Response.json(
      { ok: false, error: "Failed to load user summary", detail: message },
      { status: 500 }
    );
  }
}
