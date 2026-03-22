import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { upsertGoogleUser } from '@/app/api/_lib/authUser';
import { finalizePayPalSubscription, getPendingSubscription } from '@/lib/paypal';

export async function POST(req: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) return NextResponse.json({ ok: false, error: 'Please sign in before completing purchase.' }, { status: 401 });
    const body = await req.json().catch(() => ({} as any));
    const subscriptionId = String(body?.subscriptionId || '').trim();
    if (!subscriptionId) return NextResponse.json({ ok: false, error: 'subscriptionId required' }, { status: 400 });
    const user = await upsertGoogleUser(sessionUser);
    const pending = getPendingSubscription(subscriptionId);
    if (pending && String(pending.userId) !== String(user.id)) {
      return NextResponse.json({ ok: false, error: 'Subscription does not belong to the current user.' }, { status: 403 });
    }
    const done = await finalizePayPalSubscription(subscriptionId, user.id);
    if (done.email && String(done.email).toLowerCase() !== String(user.email || '').toLowerCase()) {
      return NextResponse.json({ ok: false, error: 'Subscription email mismatch.' }, { status: 403 });
    }
    return NextResponse.json({ ok: true, subscriptionTier: done.tier, status: done.status, subscriptionId });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Failed to finalize PayPal subscription.' }, { status: 500 });
  }
}
