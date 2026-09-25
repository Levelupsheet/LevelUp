import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { upsertGoogleUser } from '@/app/api/_lib/authUser';
import { finalizePayPalSubscription, getPendingSubscription, type PaidTier, paypalPlanIdForTier } from '@/lib/paypal';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ ok: false, error: 'Please sign in before activating a subscription.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({} as any));
    const subscriptionId = String(body?.subscriptionId || '').trim();
    const rawPlan = String(body?.plan || '').toUpperCase();
    if (!subscriptionId) {
      return NextResponse.json({ ok: false, error: 'subscriptionId required' }, { status: 400 });
    }
    if (rawPlan !== 'PRO' && rawPlan !== 'PREMIUM') {
      return NextResponse.json({ ok: false, error: 'Invalid plan.' }, { status: 400 });
    }

    const user = await upsertGoogleUser(sessionUser);
    const tier = rawPlan as PaidTier;
    const pending = getPendingSubscription(subscriptionId);
    if (pending && String(pending.userId) !== String(user.id)) {
      return NextResponse.json({ ok: false, error: 'Subscription does not belong to the current user.' }, { status: 403 });
    }

    const done: any = await finalizePayPalSubscription(subscriptionId, user.id);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionTier: done.tier,
        subscriptionStatus: done.status,
        paypalSubscriptionId: subscriptionId,
        paypalPlanId: done.planId || paypalPlanIdForTier(tier),
        subscriptionStartedAt: new Date(),
        subscriptionExpiresAt: done.expiresAt || null,
      } as any,
    });

    return NextResponse.json({
      ok: true,
      subscriptionTier: done.tier,
      status: done.status,
      subscriptionId,
      expiresAt: done.expiresAt || null,
      planId: done.planId || paypalPlanIdForTier(tier),
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Failed to activate PayPal subscription.' }, { status: 500 });
  }
}
