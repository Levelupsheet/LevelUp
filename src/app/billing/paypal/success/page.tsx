import { Suspense } from 'react';
import PayPalSuccessClient from './PayPalSuccessClient';

type PageProps = {
  searchParams?: Promise<{
    token?: string;
    subscription_id?: string;
  }>;
};

export default async function PayPalSuccessPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const orderId = String(params.token || '').trim();
  const subscriptionId = String(params.subscription_id || '').trim();

  return (
    <Suspense fallback={null}>
      <PayPalSuccessClient orderId={orderId} subscriptionId={subscriptionId} />
    </Suspense>
  );
}
