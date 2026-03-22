import path from 'path';
import fs from 'fs';

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

const PENDING_FILE = path.join(process.cwd(), 'data', 'paypal-orders.json');

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
