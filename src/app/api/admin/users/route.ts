import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/adminGuard";
import { prisma } from "@/lib/prisma";
import { getSubscriptionTierByEmail, setSubscriptionMetaByEmail, setSubscriptionTierByEmail } from "@/lib/subscriptions";

export async function GET(){
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try{
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        email: true,
        displayName: true,
        xp: true,
        startingPosition: true,
        moduleChoice: true,
        createdAt: true,
        lastActiveAt: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        paypalSubscriptionId: true,
        paypalPlanId: true,
      }
    });
    return NextResponse.json({
      users: users.map((u) => ({
        ...u,
        subscriptionTier: String((u as any).subscriptionTier || getSubscriptionTierByEmail(u.email) || "FREE").toUpperCase(),
      })),
    });
  }catch(e:any){
    return NextResponse.json({ error: e?.message || "Failed to load users" }, { status: 500 });
  }
}

export async function PATCH(req: Request){
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try{
    const body = await req.json();
    const {
      id,
      xp,
      startingPosition,
      moduleChoice,
      subscriptionTier,
      subscriptionStatus,
      subscriptionExpiresAt,
      paypalSubscriptionId,
      paypalPlanId
    } = body || {};

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const data: any = {};
    if (typeof xp === "number") data.xp = Math.max(0, Math.floor(xp));
    if (typeof startingPosition === "string") data.startingPosition = startingPosition;
    if (typeof moduleChoice === "string") data.moduleChoice = moduleChoice;

    if (typeof subscriptionTier === "string") {
      const tier = String(subscriptionTier).toUpperCase();
      const isPaid = tier === "PRO" || tier === "PREMIUM";

      const status =
        typeof subscriptionStatus === "string"
          ? String(subscriptionStatus).toUpperCase()
          : isPaid
            ? "ACTIVE"
            : "FREE";

      data.subscriptionTier = tier;
      data.subscriptionStatus = status;

      data.subscriptionExpiresAt =
        tier === "FREE"
          ? null
          : subscriptionExpiresAt
            ? new Date(String(subscriptionExpiresAt))
            : new Date("2099-12-31T23:59:59.000Z");

      data.paypalSubscriptionId =
        tier === "FREE"
          ? null
          : (typeof paypalSubscriptionId === "string" && paypalSubscriptionId.trim()
              ? paypalSubscriptionId.trim()
              : null);

      data.paypalPlanId =
        tier === "FREE"
          ? null
          : (typeof paypalPlanId === "string" && paypalPlanId.trim()
              ? paypalPlanId.trim()
              : null);
    }

    const user = await prisma.user.update({ where: { id }, data });

    if (typeof subscriptionTier === "string" && user.email) {
      const tier = String(subscriptionTier).toUpperCase() as any;
      const isPaid = tier === "PRO" || tier === "PREMIUM";
      const status = String(
        (user as any).subscriptionStatus || (isPaid ? "ACTIVE" : "FREE")
      ).toUpperCase() as any;

      setSubscriptionTierByEmail(user.email, tier);
      setSubscriptionMetaByEmail(user.email, {
        tier,
        status,
        expiresAt: (user as any).subscriptionExpiresAt
          ? new Date((user as any).subscriptionExpiresAt).toISOString()
          : (isPaid ? "2099-12-31T23:59:59.000Z" : null),
        paypalSubscriptionId: (user as any).paypalSubscriptionId || null,
        paypalPlanId: (user as any).paypalPlanId || null,
      });
    }

    return NextResponse.json({
      user: {
        ...user,
        subscriptionTier: String((user as any).subscriptionTier || getSubscriptionTierByEmail(user.email) || "FREE").toUpperCase(),
      }
    });
  }catch(e:any){
    return NextResponse.json({ error: e?.message || "Failed to update user" }, { status: 500 });
  }
}
