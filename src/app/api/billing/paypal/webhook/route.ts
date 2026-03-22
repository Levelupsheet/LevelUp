import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  downgradeSubscriptionByEmail,
  setSubscriptionMetaByEmail,
  setSubscriptionTierByEmail,
} from "@/lib/subscriptions";

const PAYPAL_BASE =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

type Tier = "FREE" | "PRO" | "PREMIUM";

function planIdToTier(planId: string | null | undefined): Tier {
  const pro = process.env.NEXT_PUBLIC_PAYPAL_PRO_PLAN_ID || "P-0L833853TV738062GNG7XKAI";
  const premium =
    process.env.NEXT_PUBLIC_PAYPAL_PREMIUM_PLAN_ID || "P-44119510FD537603NNG7XNMQ";

  if (planId === premium) return "PREMIUM";
  if (planId === pro) return "PRO";
  return "FREE";
}

async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET");
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Failed to get PayPal access token");
  }

  const data = await res.json();
  return data.access_token as string;
}

async function verifyWebhook(bodyText: string, headers: Headers) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return true;

  const accessToken = await getPayPalAccessToken();

  const payload = {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: webhookId,
    webhook_event: JSON.parse(bodyText),
  };

  const res = await fetch(`${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) return false;

  const data = await res.json();
  return data.verification_status === "SUCCESS";
}

async function syncUserSubscriptionByPayPalId(
  paypalSubscriptionId: string,
  update: {
    subscriptionTier?: Tier;
    subscriptionStatus?: string;
    subscriptionExpiresAt?: Date | null;
    paypalPlanId?: string | null;
    subscriptionStartedAt?: Date | null;
  }
) {
  const user = await prisma.user.findFirst({
    where: { paypalSubscriptionId },
  });

  if (!user) return null;

  const nextData: any = {
    ...update,
  };

  await prisma.user.update({
    where: { id: user.id },
    data: nextData,
  });

  if (user.email) {
    const tier = (update.subscriptionTier || (user as any).subscriptionTier || "FREE") as Tier;
    const status =
      update.subscriptionStatus ||
      String((user as any).subscriptionStatus || (tier === "FREE" ? "FREE" : "ACTIVE"));

    if (tier === "FREE") {
      downgradeSubscriptionByEmail(user.email, status as any);
    } else {
      setSubscriptionTierByEmail(user.email, tier);
      setSubscriptionMetaByEmail(user.email, {
        tier,
        status: status as any,
        expiresAt: update.subscriptionExpiresAt
          ? update.subscriptionExpiresAt.toISOString()
          : null,
        paypalSubscriptionId,
        paypalPlanId: update.paypalPlanId || null,
        startedAt: update.subscriptionStartedAt
          ? update.subscriptionStartedAt.toISOString()
          : null,
      });
    }
  }

  return user;
}

export async function POST(req: Request) {
  try {
    const bodyText = await req.text();
    const body = JSON.parse(bodyText);

    const verified = await verifyWebhook(bodyText, req.headers);
    if (!verified) {
      return NextResponse.json({ ok: false, error: "Invalid PayPal webhook signature" }, { status: 400 });
    }

    const eventType = String(body?.event_type || "");
    const resource = body?.resource || {};
    const subscriptionId = String(
      resource?.id ||
        resource?.billing_agreement_id ||
        resource?.supplementary_data?.related_ids?.subscription_id ||
        ""
    ).trim();

    if (!subscriptionId) {
      return NextResponse.json({ ok: true, ignored: true, reason: "No subscription id" });
    }

    const resourcePlanId = String(resource?.plan_id || "").trim() || null;
    const tier = planIdToTier(resourcePlanId);

    if (eventType === "BILLING.SUBSCRIPTION.ACTIVATED") {
      await syncUserSubscriptionByPayPalId(subscriptionId, {
        subscriptionTier: tier,
        subscriptionStatus: "ACTIVE",
        paypalPlanId: resourcePlanId,
        subscriptionStartedAt: resource?.start_time ? new Date(resource.start_time) : new Date(),
      });
    } else if (eventType === "BILLING.SUBSCRIPTION.RE-ACTIVATED") {
      await syncUserSubscriptionByPayPalId(subscriptionId, {
        subscriptionTier: tier,
        subscriptionStatus: "ACTIVE",
        paypalPlanId: resourcePlanId,
      });
    } else if (eventType === "BILLING.SUBSCRIPTION.UPDATED") {
      const nextBilling =
        resource?.billing_info?.next_billing_time
          ? new Date(resource.billing_info.next_billing_time)
          : null;

      await syncUserSubscriptionByPayPalId(subscriptionId, {
        subscriptionTier: tier,
        subscriptionStatus: String(resource?.status || "ACTIVE").toUpperCase(),
        subscriptionExpiresAt: nextBilling,
        paypalPlanId: resourcePlanId,
      });
    } else if (
      eventType === "BILLING.SUBSCRIPTION.CANCELLED" ||
      eventType === "BILLING.SUBSCRIPTION.EXPIRED" ||
      eventType === "BILLING.SUBSCRIPTION.SUSPENDED"
    ) {
      await syncUserSubscriptionByPayPalId(subscriptionId, {
        subscriptionTier: "FREE",
        subscriptionStatus: eventType.endsWith("EXPIRED")
          ? "EXPIRED"
          : eventType.endsWith("CANCELLED")
          ? "CANCELLED"
          : "SUSPENDED",
        subscriptionExpiresAt: new Date(),
      });
    } else if (eventType === "PAYMENT.SALE.COMPLETED") {
      const nextBilling =
        resource?.billing_agreement_id || resource?.supplementary_data?.related_ids?.subscription_id
          ? resource?.billing_info?.next_billing_time
            ? new Date(resource.billing_info.next_billing_time)
            : null
          : null;

      await syncUserSubscriptionByPayPalId(subscriptionId, {
        subscriptionStatus: "ACTIVE",
        subscriptionExpiresAt: nextBilling,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Webhook processing failed" },
      { status: 500 }
    );
  }
}