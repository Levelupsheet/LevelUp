import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { downgradeSubscriptionByEmail, setSubscriptionMetaByEmail, setSubscriptionTierByEmail, type SubscriptionStatus } from '@/lib/subscriptions';

export type PaidTier = 'PRO' | 'PREMIUM';

export const PAYPAL_PLAN_CONFIG: Record<PaidTier, { amount: string; label: string }> = {
  PRO: { amount: '8.99', label: 'LevelUp Pro' },
  PREMIUM: { amount: '14.99', label: 'LevelUp Premium' },
};

type PendingOrder = {
  orderId: string;
  userId: string;
  email: string;
  tier: PaidTier;
  amount: string;
  status: 'CREATED' | 'CAPTURED' | 'FAILED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
  paypalCaptureId?: string | null;
};

type PendingMap = Record<string, PendingOrder>;


async function syncDbSubscriptionByEmail(email: string, patch: {
  tier?: string | null;
  status?: string | null;
  startedAt?: string | null;
  expiresAt?: string | null;
  paypalSubscriptionId?: string | null;
  paypalPlanId?: string | null;
}) {
  const key = String(email || '').trim().toLowerCase();
  if (!key) return;
  const data: any = {};
  if (patch.tier !== undefined) data.subscriptionTier = patch.tier || 'FREE';
  if (patch.status !== undefined) data.subscriptionStatus = patch.status || 'FREE';
  if (patch.startedAt !== undefined) data.subscriptionStartedAt = patch.startedAt ? new Date(patch.startedAt) : null;
  if (patch.expiresAt !== undefined) data.subscriptionExpiresAt = patch.expiresAt ? new Date(patch.expiresAt) : null;
  if (patch.paypalSubscriptionId !== undefined) data.paypalSubscriptionId = patch.paypalSubscriptionId || null;
  if (patch.paypalPlanId !== undefined) data.paypalPlanId = patch.paypalPlanId || null;
  try {
    await prisma.user.updateMany({ where: { email: key }, data });
  } catch {}
}

type PendingSubscription = {
  subscriptionId: string;
  userId: string;
  email: string;
  tier: PaidTier;
  planId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  customId?: string | null;
};

type PendingSubscriptionMap = Record<string, PendingSubscription>;

const PENDING_FILE = path.join(process.cwd(), 'data', 'paypal-orders.json');
const SUBS_FILE = path.join(process.cwd(), 'data', 'paypal-subscriptions.json');

function ensureDir() {
  fs.mkdirSync(path.dirname(PENDING_FILE), { recursive: true });
}

export function paypalBaseUrl() {
  return String(process.env.PAYPAL_ENV || 'sandbox').toLowerCase() === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

export function paypalClientId() {
  const v = process.env.PAYPAL_CLIENT_ID || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  if (!v) throw new Error('Missing PAYPAL_CLIENT_ID');
  return v;
}

export function paypalClientSecret() {
  const v = process.env.PAYPAL_CLIENT_SECRET;
  if (!v) throw new Error('Missing PAYPAL_CLIENT_SECRET');
  return v;
}

export function paypalPlanIdForTier(tier: PaidTier) {
  const key = tier === 'PREMIUM' ? process.env.PAYPAL_PREMIUM_PLAN_ID : process.env.PAYPAL_PRO_PLAN_ID;
  if (!key) throw new Error(`Missing ${tier === 'PREMIUM' ? 'PAYPAL_PREMIUM_PLAN_ID' : 'PAYPAL_PRO_PLAN_ID'}`);
  return key;
}

export async function getPayPalAccessToken() {
  const auth = Buffer.from(`${paypalClientId()}:${paypalClientSecret()}`).toString('base64');
  const res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Failed to get PayPal access token: ${detail || res.statusText}`);
  }

  const data = await res.json();
  return String(data.access_token || '');
}

export function readPendingOrders(): PendingMap {
  try {
    const raw = fs.readFileSync(PENDING_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    ensureDir();
    fs.writeFileSync(PENDING_FILE, JSON.stringify({}, null, 2));
    return {};
  }
}

export function writePendingOrders(map: PendingMap) {
  ensureDir();
  fs.writeFileSync(PENDING_FILE, JSON.stringify(map, null, 2));
}

export function savePendingOrder(order: PendingOrder) {
  const map = readPendingOrders();
  map[order.orderId] = order;
  writePendingOrders(map);
}

export function getPendingOrder(orderId: string) {
  const map = readPendingOrders();
  return map[String(orderId || '')] || null;
}

export function updatePendingOrder(orderId: string, patch: Partial<PendingOrder>) {
  const map = readPendingOrders();
  const key = String(orderId || '');
  if (!map[key]) return null;
  map[key] = { ...map[key], ...patch, updatedAt: new Date().toISOString() };
  writePendingOrders(map);
  return map[key];
}

export function readPendingSubscriptions(): PendingSubscriptionMap {
  try {
    const raw = fs.readFileSync(SUBS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    ensureDir();
    fs.writeFileSync(SUBS_FILE, JSON.stringify({}, null, 2));
    return {};
  }
}

export function writePendingSubscriptions(map: PendingSubscriptionMap) {
  ensureDir();
  fs.writeFileSync(SUBS_FILE, JSON.stringify(map, null, 2));
}

export function savePendingSubscription(row: PendingSubscription) {
  const map = readPendingSubscriptions();
  map[row.subscriptionId] = row;
  writePendingSubscriptions(map);
}

export function getPendingSubscription(subscriptionId: string) {
  const map = readPendingSubscriptions();
  return map[String(subscriptionId || '')] || null;
}

export function updatePendingSubscription(subscriptionId: string, patch: Partial<PendingSubscription>) {
  const map = readPendingSubscriptions();
  const key = String(subscriptionId || '');
  if (!map[key]) return null;
  map[key] = { ...map[key], ...patch, updatedAt: new Date().toISOString() };
  writePendingSubscriptions(map);
  return map[key];
}

export function appBaseUrl(req?: Request) {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  try {
    if (req) {
      const u = new URL(req.url);
      return `${u.protocol}//${u.host}`;
    }
  } catch {}
  return 'http://localhost:3000';
}

export function buildSubscriptionCustomId(params: { userId: string; email: string; tier: PaidTier }) {
  const payload = JSON.stringify({ userId: params.userId, email: params.email, tier: params.tier });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function parseSubscriptionCustomId(v?: string | null): { userId: string; email: string; tier: PaidTier } | null {
  try {
    const raw = Buffer.from(String(v || ''), 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    const tier = String(parsed?.tier || '').toUpperCase();
    if ((tier !== 'PRO' && tier !== 'PREMIUM') || !parsed?.email) return null;
    return { userId: String(parsed.userId || ''), email: String(parsed.email || ''), tier } as any;
  } catch {
    return null;
  }
}

export async function createPayPalSubscription(params: { tier: PaidTier; userId: string; email: string; returnBase: string; }) {
  const token = await getPayPalAccessToken();
  const planId = paypalPlanIdForTier(params.tier);
  const customId = buildSubscriptionCustomId(params);
  const res = await fetch(`${paypalBaseUrl()}/v1/billing/subscriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      plan_id: planId,
      custom_id: customId,
      application_context: {
        brand_name: 'LevelUp Pro',
        user_action: 'SUBSCRIBE_NOW',
        shipping_preference: 'NO_SHIPPING',
        return_url: `${params.returnBase}/billing/paypal/success`,
        cancel_url: `${params.returnBase}/billing/paypal/cancel`,
      },
    }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Failed to create PayPal subscription: ${detail || res.statusText}`);
  }
  const data = await res.json();
  const subscriptionId = String(data.id || '');
  if (!subscriptionId) throw new Error('PayPal subscription id missing');
  const approveUrl = Array.isArray(data.links)
    ? String(data.links.find((l: any) => l?.rel === 'approve')?.href || '')
    : '';
  savePendingSubscription({
    subscriptionId,
    userId: params.userId,
    email: params.email,
    tier: params.tier,
    planId,
    status: String(data.status || 'APPROVAL_PENDING'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    customId,
  });
  setSubscriptionMetaByEmail(params.email, {
    tier: params.tier,
    status: 'PENDING',
    paypalSubscriptionId: subscriptionId,
    paypalPlanId: planId,
    updatedAt: new Date().toISOString(),
  });
  void syncDbSubscriptionByEmail(params.email, {
    tier: params.tier,
    status: 'PENDING',
    paypalSubscriptionId: subscriptionId,
    paypalPlanId: planId,
  });
  return { subscriptionId, approveUrl, raw: data };
}

export async function getPayPalSubscriptionDetails(subscriptionId: string) {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${paypalBaseUrl()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Failed to load PayPal subscription: ${detail || res.statusText}`);
  }
  return res.json();
}

function mapSubscriptionStatus(statusRaw: string): SubscriptionStatus {
  const s = String(statusRaw || '').toUpperCase();
  if (s === 'ACTIVE') return 'ACTIVE';
  if (s === 'APPROVAL_PENDING') return 'PENDING';
  if (s === 'CANCELLED') return 'CANCELLED';
  if (s === 'EXPIRED') return 'EXPIRED';
  if (s === 'SUSPENDED') return 'SUSPENDED';
  return 'PENDING';
}

export async function finalizePayPalSubscription(subscriptionId: string) {
  const details = await getPayPalSubscriptionDetails(subscriptionId);
  const status = String(details?.status || '');
  const pending = getPendingSubscription(subscriptionId);
  const parsedCustom = parseSubscriptionCustomId(String(details?.custom_id || pending?.customId || ''));
  const email = String(parsedCustom?.email || pending?.email || '').toLowerCase();
  const tier = (parsedCustom?.tier || pending?.tier || 'PRO') as PaidTier;
  const planId = String(details?.plan_id || pending?.planId || '');
  const startTime = String(details?.start_time || new Date().toISOString());
  let nextBillingTime = String(details?.billing_info?.next_billing_time || '');
  if (!nextBillingTime) {
    const d = new Date(startTime || Date.now());
    d.setMonth(d.getMonth() + 1);
    nextBillingTime = d.toISOString();
  }
  updatePendingSubscription(subscriptionId, { status });
  if (email) {
    const mapped = mapSubscriptionStatus(status);
    if (mapped === 'ACTIVE') {
      setSubscriptionMetaByEmail(email, {
        tier,
        status: 'ACTIVE',
        paypalSubscriptionId: subscriptionId,
        paypalPlanId: planId,
        startedAt: startTime,
        expiresAt: nextBillingTime,
      });
      setSubscriptionTierByEmail(email, tier);
      await syncDbSubscriptionByEmail(email, {
        tier,
        status: 'ACTIVE',
        startedAt: startTime,
        expiresAt: nextBillingTime,
        paypalSubscriptionId: subscriptionId,
        paypalPlanId: planId,
      });
    } else if (mapped === 'PENDING') {
      setSubscriptionMetaByEmail(email, {
        tier,
        status: 'PENDING',
        paypalSubscriptionId: subscriptionId,
        paypalPlanId: planId,
        startedAt: startTime,
        expiresAt: nextBillingTime,
      });
      await syncDbSubscriptionByEmail(email, {
        tier,
        status: 'PENDING',
        startedAt: startTime,
        expiresAt: nextBillingTime,
        paypalSubscriptionId: subscriptionId,
        paypalPlanId: planId,
      });
    } else {
      downgradeSubscriptionByEmail(email, mapped);
      await syncDbSubscriptionByEmail(email, {
        tier: 'FREE',
        status: mapped,
        expiresAt: new Date().toISOString(),
        paypalSubscriptionId: subscriptionId,
        paypalPlanId: planId,
      });
    }
  }
  return { details, pending, email, tier, status };
}

export async function verifyWebhookSignature(req: Request, bodyText: string) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return true;
  const transmissionId = req.headers.get('paypal-transmission-id');
  const transmissionTime = req.headers.get('paypal-transmission-time');
  const certUrl = req.headers.get('paypal-cert-url');
  const authAlgo = req.headers.get('paypal-auth-algo');
  const transmissionSig = req.headers.get('paypal-transmission-sig');
  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    return false;
  }
  const token = await getPayPalAccessToken();
  const res = await fetch(`${paypalBaseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: JSON.parse(bodyText),
    }),
    cache: 'no-store',
  });
  if (!res.ok) return false;
  const data = await res.json().catch(() => null);
  return String(data?.verification_status || '').toUpperCase() === 'SUCCESS';
}

export async function applyWebhookEvent(event: any) {
  const eventType = String(event?.event_type || '');
  const resource = event?.resource || {};
  const subscriptionId = String(resource?.id || resource?.billing_agreement_id || resource?.resource?.id || '');
  if (!subscriptionId) return { ok: false, reason: 'subscription id missing' };
  const pending = getPendingSubscription(subscriptionId);
  const parsedCustom = parseSubscriptionCustomId(String(resource?.custom_id || pending?.customId || ''));
  const email = String(parsedCustom?.email || pending?.email || '').toLowerCase();
  const tier = (parsedCustom?.tier || pending?.tier || 'PRO') as PaidTier;
  const planId = String(resource?.plan_id || pending?.planId || '');
  const updateCommon = {
    paypalSubscriptionId: subscriptionId,
    paypalPlanId: planId,
    startedAt: String(resource?.start_time || new Date().toISOString()),
    expiresAt: String(resource?.billing_info?.next_billing_time || ''),
  };

  if (pending) updatePendingSubscription(subscriptionId, { status: String(resource?.status || eventType) });
  if (!email) return { ok: true, reason: 'no email available' };

  if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED' || String(resource?.status || '').toUpperCase() === 'ACTIVE') {
    setSubscriptionMetaByEmail(email, { tier, status: 'ACTIVE', ...updateCommon });
    setSubscriptionTierByEmail(email, tier);
    await syncDbSubscriptionByEmail(email, { tier, status: 'ACTIVE', ...updateCommon });
    return { ok: true, status: 'ACTIVE' };
  }
  if (eventType === 'PAYMENT.SALE.COMPLETED' || eventType === 'BILLING.SUBSCRIPTION.RE-ACTIVATED') {
    setSubscriptionMetaByEmail(email, { tier, status: 'ACTIVE', ...updateCommon });
    setSubscriptionTierByEmail(email, tier);
    await syncDbSubscriptionByEmail(email, { tier, status: 'ACTIVE', ...updateCommon });
    return { ok: true, status: 'ACTIVE' };
  }
  if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED') {
    downgradeSubscriptionByEmail(email, 'CANCELLED');
    await syncDbSubscriptionByEmail(email, { tier: 'FREE', status: 'CANCELLED', expiresAt: new Date().toISOString(), paypalSubscriptionId: subscriptionId, paypalPlanId: planId });
    return { ok: true, status: 'CANCELLED' };
  }
  if (eventType === 'BILLING.SUBSCRIPTION.EXPIRED') {
    downgradeSubscriptionByEmail(email, 'EXPIRED');
    await syncDbSubscriptionByEmail(email, { tier: 'FREE', status: 'EXPIRED', expiresAt: new Date().toISOString(), paypalSubscriptionId: subscriptionId, paypalPlanId: planId });
    return { ok: true, status: 'EXPIRED' };
  }
  if (eventType === 'BILLING.SUBSCRIPTION.SUSPENDED' || eventType === 'PAYMENT.SALE.DENIED') {
    downgradeSubscriptionByEmail(email, 'SUSPENDED');
    await syncDbSubscriptionByEmail(email, { tier: 'FREE', status: 'SUSPENDED', expiresAt: new Date().toISOString(), paypalSubscriptionId: subscriptionId, paypalPlanId: planId });
    return { ok: true, status: 'SUSPENDED' };
  }
  return { ok: true, status: 'IGNORED' };
}

export async function createPayPalOrder(params: {
  tier: PaidTier;
  userId: string;
  email: string;
  returnBase: string;
}) {
  const token = await getPayPalAccessToken();
  const cfg = PAYPAL_PLAN_CONFIG[params.tier];
  const payload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        custom_id: `${params.userId}|${params.tier}`,
        description: cfg.label,
        amount: { currency_code: 'USD', value: cfg.amount },
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          shipping_preference: 'NO_SHIPPING',
          user_action: 'PAY_NOW',
          return_url: `${params.returnBase}/billing/paypal/success`,
          cancel_url: `${params.returnBase}/billing/paypal/cancel`,
        },
      },
    },
  };

  const res = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Failed to create PayPal order: ${detail || res.statusText}`);
  }

  const data = await res.json();
  const orderId = String(data.id || '');
  if (!orderId) throw new Error('PayPal order id missing');
  const approveUrl = Array.isArray(data.links)
    ? String(data.links.find((l: any) => l?.rel === 'approve')?.href || '')
    : '';

  savePendingOrder({
    orderId,
    userId: params.userId,
    email: params.email,
    tier: params.tier,
    amount: cfg.amount,
    status: 'CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    paypalCaptureId: null,
  });

  return { orderId, approveUrl, raw: data };
}

export async function capturePayPalOrder(orderId: string) {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Failed to capture PayPal order: ${detail || res.statusText}`);
  }

  const data = await res.json();
  return data;
}
