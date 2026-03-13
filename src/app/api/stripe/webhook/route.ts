import { prisma } from "@/lib/prisma";
import { applySubscriptionContribution, getPrizePoolSummary, SUBSCRIPTION_POOL_CONTRIBUTION_BPS, verifyStripeWebhookSignature } from "@/lib/prizePools";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");
    const secret = process.env.STRIPE_WEBHOOK_SECRET || "";

    if (process.env.NODE_ENV === "production") {
      const verified = verifyStripeWebhookSignature(rawBody, signature, secret);
      if (!verified.ok) {
        return Response.json({ ok: false, error: "Invalid Stripe webhook signature", reason: verified.reason }, { status: 400 });
      }
    }

    const event = JSON.parse(rawBody || "{}");
    const eventType = String(event?.type || "");
    const object = event?.data?.object || {};

    if (!["invoice.payment_succeeded", "checkout.session.completed"].includes(eventType)) {
      return Response.json({ ok: true, ignored: true, eventType });
    }

    const amountPaidCents = Math.max(0, Math.floor(Number(object?.amount_paid || object?.amount_total || 0)));
    if (amountPaidCents <= 0) {
      return Response.json({ ok: true, ignored: true, reason: "No paid amount on event", eventType });
    }

    const result = await prisma.$transaction(async (tx) => {
      const applied = await applySubscriptionContribution(tx as any, {
        amountPaidCents,
        percentBps: SUBSCRIPTION_POOL_CONTRIBUTION_BPS,
        eventId: String(event?.id || "") || null,
      });
      const prizePools = await getPrizePoolSummary(tx as any);
      return { applied, prizePools };
    });

    const { applied, prizePools } = result as any;
    return Response.json({ ok: true, eventType, applied, prizePools });
  } catch (error: any) {
    return Response.json({ ok: false, error: "Failed to process Stripe webhook", detail: String(error?.message || error) }, { status: 500 });
  }
}
