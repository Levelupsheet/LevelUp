import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/adminGuard";
import { prisma } from "@/lib/prisma";
import { syncPayPalSubscriptionForUser } from "@/lib/paypal";

export async function POST(req: Request) {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try {
    const body = await req.json().catch(() => ({} as any));
    const userId = String(body?.userId || "").trim();
    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        subscriptionTier: true,
        paypalSubscriptionId: true,
      } as any,
    });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const subscriptionId = String((body?.subscriptionId ?? (user as any).paypalSubscriptionId) || "").trim();
    if (!subscriptionId || subscriptionId.toUpperCase() === "FREE") {
      return NextResponse.json({ error: "No PayPal subscription ID stored for this user." }, { status: 400 });
    }

    const synced = await syncPayPalSubscriptionForUser({
      userId: user.id,
      email: String((user as any).email || ""),
      subscriptionId,
      expectedTier: String((user as any).subscriptionTier || "PRO").toUpperCase() === "PREMIUM" ? "PREMIUM" : "PRO",
    });

    return NextResponse.json({ ok: true, synced });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to sync PayPal subscription" }, { status: 500 });
  }
}
