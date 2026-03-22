import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth/session';
import { upsertGoogleUser } from '@/app/api/_lib/authUser';
import {
  finalizePayPalSubscription,
  savePendingSubscription,
  type PaidTier,
  paypalPlanIdForTier,
} from '@/lib/paypal';

export async function POST(req: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json(
        { ok: false, error: 'Please sign in before activating a subscription.' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({} as any));
    const subscriptionId = String(body?.subscriptionId || '').trim();
    const rawPlan = String(body?.plan || '').toUpperCase();

    if (!subscriptionId) {
      return NextResponse.json(
        { ok: false, error: 'subscriptionId required' },
        { status: 400 }
      );
    }

    if (rawPlan !== 'PRO' && rawPlan !== 'PREMIUM') {
      return NextResponse.json(
        { ok: false, error: 'Invalid plan.' },
        { status: 400 }
      );
    }

    const user = await upsertGoogleUser(sessionUser);
    const tier = rawPlan as PaidTier;

    savePendingSubscription({
      subscriptionId,
      userId: user.id,
      email: user.email,
      tier,
      planId: paypalPlanIdForTier(tier),
      status: 'APPROVAL_PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      customId: user.id,
    });

    const done = await finalizePayPalSubscription(subscriptionId, user.id);
    const expiresAt = (done as any).expiresAt || null;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionTier: done.tier,
        subscriptionStatus: done.status,
        paypalSubscriptionId: subscriptionId,
        paypalPlanId: (done as any).planId || paypalPlanIdForTier(tier),
        subscriptionStartedAt: new Date(),
        subscriptionExpiresAt: expiresAt,
      } as any,
    });

    return NextResponse.json({
      ok: true,
      subscriptionTier: done.tier,
      status: done.status,
      subscriptionId,
      expiresAt,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || 'Failed to activate PayPal subscription.',
      },
      { status: 500 }
    );
  }
}