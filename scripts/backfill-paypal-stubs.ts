import { prisma } from "../src/lib/prisma";

const BASE =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

async function getToken() {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const json = await res.json();
  return json.access_token;
}

async function run() {
  const token = await getToken();

  const res = await fetch(`${BASE}/v1/billing/subscriptions?status=ACTIVE`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();

  for (const sub of data.subscriptions || []) {
    const subId = sub.id;
    const email = sub.subscriber?.email_address;

    if (!email) continue;

    const user = await prisma.user.findFirst({
      where: { email },
    });

    if (!user) continue;

    const tier =
      sub.plan_id === process.env.PAYPAL_PREMIUM_PLAN_ID
        ? "PREMIUM"
        : "PRO";

    console.log("Updating:", email, tier);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionTier: tier,
        subscriptionStatus: "ACTIVE",
        paypalSubscriptionId: subId,
        paypalPlanId: sub.plan_id,
        subscriptionStartedAt: new Date(),
        subscriptionExpiresAt: sub.billing_info?.next_billing_time
          ? new Date(sub.billing_info.next_billing_time)
          : null,
      },
    });
  }

  console.log("Done.");
}

run();