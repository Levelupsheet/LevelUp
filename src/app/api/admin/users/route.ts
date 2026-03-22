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
      }
    });
    return NextResponse.json({ users: users.map((u) => ({ ...u, subscriptionTier: String((u as any).subscriptionTier || getSubscriptionTierByEmail(u.email) || 'FREE').toUpperCase() })) });
  }catch(e:any){
    return NextResponse.json({ error: e?.message || "Failed to load users" }, { status: 500 });
  }
}

export async function PATCH(req: Request){
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try{
    const body = await req.json();
    const { id, xp, startingPosition, moduleChoice, subscriptionTier } = body || {};
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const data: any = {};
    if (typeof xp === "number") data.xp = xp;
    if (startingPosition) data.startingPosition = startingPosition;
    if (moduleChoice) data.moduleChoice = moduleChoice;
    if (typeof subscriptionTier === "string") {
      const tier = String(subscriptionTier).toUpperCase();
      data.subscriptionTier = tier;
      data.subscriptionStatus = tier === 'FREE' ? 'FREE' : 'ACTIVE';
      data.subscriptionExpiresAt = tier === 'FREE' ? null : (data.subscriptionExpiresAt || null);
    }

    const user = await prisma.user.update({ where: { id }, data });
    if (typeof subscriptionTier === "string" && user.email) {
      const tier = String(subscriptionTier).toUpperCase() as any;
      setSubscriptionTierByEmail(user.email, tier);
      setSubscriptionMetaByEmail(user.email, { tier, status: tier === 'FREE' ? 'FREE' : 'ACTIVE' });
    }
    return NextResponse.json({ user: { ...user, subscriptionTier: String((user as any).subscriptionTier || getSubscriptionTierByEmail(user.email) || 'FREE').toUpperCase() } });
  }catch(e:any){
    return NextResponse.json({ error: e?.message || "Failed to update user" }, { status: 500 });
  }
}
