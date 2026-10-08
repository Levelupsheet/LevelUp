"use client";

import { useRouter } from 'next/navigation';

export default function PayPalCancelPage() {
  const router = useRouter();
  return (
    <main className="paidAssetPage billingResultPage" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#050914', color: '#fff', padding: 24 }}>
      <div className="card paidAssetHero" style={{ width: 'min(560px, 100%)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 24, padding: 24, background: 'rgba(9,14,28,0.92)' }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Checkout cancelled</h1>
        <p style={{ opacity: 0.86, marginTop: 12 }}>Your PayPal checkout was cancelled. No changes were made to your subscription.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
          <button className="secondaryBtn gdActionBlue" onClick={() => router.replace('/start#pricing')} style={{ padding: '10px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.16)', background: 'transparent', color: '#fff' }}>Back to pricing</button>
          <button className="secondaryBtn gdActionBlue" onClick={() => router.replace('/dashboard')} style={{ padding: '10px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.16)', background: 'transparent', color: '#fff' }}>Go to dashboard</button>
        </div>
      </div>
    </main>
  );
}
