import { NextResponse } from 'next/server';
import { applyWebhookEvent, verifyWebhookSignature } from '@/lib/paypal';

export async function POST(req: Request) {
  try {
    const bodyText = await req.text();
    const verified = await verifyWebhookSignature(req, bodyText);
    if (!verified) return NextResponse.json({ ok: false, error: 'Invalid PayPal webhook signature.' }, { status: 400 });
    const event = JSON.parse(bodyText || '{}');
    const result = await applyWebhookEvent(event);
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error('PayPal webhook processing failed', err);
    return NextResponse.json({ ok: false, error: 'Failed to process PayPal webhook.' }, { status: 500 });
  }
}
