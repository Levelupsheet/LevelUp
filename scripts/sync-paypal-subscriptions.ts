import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE =
  String(process.env.PAYPAL_ENV || "").toLowerCase() === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

function proPlanId() {
  return String(process.env.PAYPAL_PRO_PLAN_ID || process.env.NEXT_PUBLIC_PAYPAL_PRO_PLAN_ID || "P-0L833853TV738062GNG7XKAI");
}

function premiumPlanId() {
  return String(process.env.PAYPAL_PREMIUM_PLAN_ID || process.env.NEXT_PUBLIC_PAYPAL_PREMIUM_PLAN_ID || "P-44119510FD537603NNG7XNMQ");
}

async function getToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET");

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to get PayPal token: ${text || res.statusText}`);
  }

  const json = await res.json();
  return String(json.access_token || "");
}

async function getSubscription(accessToken: string, subscriptionId: string): Promise<any> {
  const res = await fetch(`${BASE}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to fetch subscription ${subscriptionId}: ${text || res.statusText}`);
  }
  return await res.json();
}

function mapStatus(statusRaw: string): string {
  const s = String(statusRaw || "").toUpperCase();
  if (s === "ACTIVE") return "ACTIVE";
  if (s === "APPROVAL_PENDING") return "PENDING";
  if (s === "CANCELLED") return "CANCELLED";
  if (s === "EXPIRED") return "EXPIRED";
  if (s === "SUSPENDED") return "SUSPENDED";
  return "PENDING";
}

async function run() {
  const token = await getToken();
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { paypalSubscriptionId: { not: null } } as any,
        { subscriptionTier: { in: ["PRO", "PREMIUM"] } } as any,
      ],
    },
    select: {
      id: true,
      email: true,
      subscriptionTier: true,
      paypalSubscriptionId: true,
    } as any,
  });

  let updated = 0;
  let skipped = 0;

  for (const user of users as any[]) {
    const subId = String(user.paypalSubscriptionId || "").trim();
    if (!subId || subId.toUpperCase() === "FREE") {
      skipped += 1;
      continue;
    }

    try {
      const sub = await getSubscription(token, subId);
      const planId = String(sub.plan_id || "").trim();
      const mapped = mapStatus(String(sub.status || ""));
      const tier = planId === premiumPlanId() ? "PREMIUM" : planId === proPlanId() ? "PRO" : "FREE";
      const startedAt = sub.start_time ? new Date(sub.start_time) : null;
      const expiresAt = sub.billing_info?.next_billing_time ? new Date(sub.billing_info.next_billing_time) : null;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionTier: mapped === "ACTIVE" || mapped === "PENDING" ? tier : "FREE",
          subscriptionStatus: mapped,
          paypalSubscriptionId: subId,
          paypalPlanId: planId || null,
          subscriptionStartedAt: startedAt,
          subscriptionExpiresAt: expiresAt,
        } as any,
      });

      console.log(`Synced ${user.email}: ${mapped} ${tier} (${subId})`);
      updated += 1;
    } catch (err: any) {
      console.error(`Failed to sync ${user.email}: ${err?.message || err}`);
    }
  }

  console.log(`Done. Updated ${updated}, skipped ${skipped}.`);
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
