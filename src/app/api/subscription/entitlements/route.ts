import { getRequestUserId } from "@/app/api/_lib/authUser";
import { prisma } from "@/app/api/_lib/prisma";
import { getSubscriptionTierByEmail } from "@/lib/subscriptions";
import { getTierEntitlements, nextTier } from "@/lib/entitlements";

export async function GET(req: Request) {
  try {
    const userId = await getRequestUserId(req);
    if (!userId) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, subscriptionTier: true, subscriptionExpiresAt: true, subscriptionStatus: true } as any });
    const tier = String((user as any)?.subscriptionTier || getSubscriptionTierByEmail((user as any)?.email) || "FREE").toUpperCase();
    const entitlements = getTierEntitlements(tier);
    return Response.json({ ok: true, tier, entitlements, nextTier: nextTier(tier), expiresAt: (user as any)?.subscriptionExpiresAt || null, status: (user as any)?.subscriptionStatus || (tier === 'FREE' ? 'FREE' : 'ACTIVE') });
  } catch (err: any) {
    return Response.json({ ok: false, error: err?.message || "Failed to load entitlements" }, { status: 500 });
  }
}
