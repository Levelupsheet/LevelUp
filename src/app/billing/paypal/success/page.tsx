"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function PayPalSuccessPage() {
  const router = useRouter();
  const params = useSearchParams();
  const orderId = useMemo(() => String(params.get('token') || '').trim(), [params]);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Completing your PayPal purchase...');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!orderId) {
        setStatus('error');
        setMessage('Missing PayPal order token.');
        return;
      }
      try {
        const res = await fetch('/api/billing/paypal/capture-order', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ orderId }),
        });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          setStatus('error');
          setMessage(String(data?.error || 'Failed to complete PayPal purchase.'));
          return;
        }
        setStatus('success');
        setMessage(`Payment complete. Your ${String(data?.subscriptionTier || '').toLowerCase()} plan is now active.`);
        setTimeout(() => {
          router.replace('/dashboard');
        }, 1600);
      } catch (err: any) {
        if (cancelled) return;
        setStatus('error');
        setMessage(err?.message || 'Failed to complete PayPal purchase.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, router]);

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#050914', color: '#fff', padding: 24 }}>
      <div style={{ width: 'min(560px, 100%)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 24, padding: 24, background: 'rgba(9,14,28,0.92)' }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>PayPal checkout</h1>
        <p style={{ opacity: 0.86, marginTop: 12 }}>{message}</p>
        {status === 'loading' ? <div style={{ opacity: 0.72 }}>Please wait…</div> : null}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={() => router.replace('/dashboard')} style={{ padding: '10px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.16)', background: 'transparent', color: '#fff' }}>Go to dashboard</button>
          <button onClick={() => router.replace('/start#pricing')} style={{ padding: '10px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.16)', background: 'transparent', color: '#fff' }}>Back to pricing</button>
        </div>
      </div>
    </main>
  );
}
