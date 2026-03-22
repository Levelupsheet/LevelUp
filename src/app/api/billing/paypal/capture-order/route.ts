import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { upsertGoogleUser } from '@/app/api/_lib/authUser';
import { capturePayPalOrder, getPendingOrder, updatePendingOrder } from '@/lib/paypal';
import { setSubscriptionTierByEmail } from '@/lib/subscriptions';

export async function POST(req: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ ok: false, error: 'Please sign in before completing purchase.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({} as any));
    const orderId = String(body?.orderId || '').trim();
    if (!orderId) {
      return NextResponse.json({ ok: false, error: 'orderId required' }, { status: 400 });
    }

    const user = await upsertGoogleUser(sessionUser);
    const pending = getPendingOrder(orderId);
    if (!pending) {
      return NextResponse.json({ ok: false, error: 'PayPal order not found.' }, { status: 404 });
    }
    if (String(pending.userId) !== String(user.id)) {
      return NextResponse.json({ ok: false, error: 'Order does not belong to the current user.' }, { status: 403 });
    }
    if (pending.status === 'CAPTURED') {
      setSubscriptionTierByEmail(user.email, pending.tier);
      return NextResponse.json({ ok: true, alreadyCaptured: true, subscriptionTier: pending.tier });
    }

    const captured = await capturePayPalOrder(orderId);
    const status = String(captured?.status || '');
    if (status !== 'COMPLETED') {
      updatePendingOrder(orderId, { status: 'FAILED' });
      return NextResponse.json({ ok: false, error: `Unexpected PayPal capture status: ${status || 'UNKNOWN'}` }, { status: 400 });
    }

    const captureId = String(captured?.purchase_units?.[0]?.payments?.captures?.[0]?.id || '');
    updatePendingOrder(orderId, { status: 'CAPTURED', paypalCaptureId: captureId || null });
    setSubscriptionTierByEmail(user.email, pending.tier);

    return NextResponse.json({ ok: true, subscriptionTier: pending.tier, captureId: captureId || null });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Failed to capture PayPal order.' }, { status: 500 });
  }
}
