import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { upsertGoogleUser } from '@/app/api/_lib/authUser';
import { appBaseUrl, createPayPalOrder, type PaidTier } from '@/lib/paypal';

export async function POST(req: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ ok: false, error: 'Please sign in before purchasing.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({} as any));
    const rawPlan = String(body?.plan || '').toUpperCase();
    if (rawPlan !== 'PRO' && rawPlan !== 'PREMIUM') {
      return NextResponse.json({ ok: false, error: 'Invalid plan.' }, { status: 400 });
    }

    const user = await upsertGoogleUser(sessionUser);
    const created = await createPayPalOrder({
      tier: rawPlan as PaidTier,
      userId: user.id,
      email: user.email,
      returnBase: appBaseUrl(req),
    });

    return NextResponse.json({ ok: true, orderId: created.orderId, approveUrl: created.approveUrl });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Failed to create PayPal order.' }, { status: 500 });
  }
}
