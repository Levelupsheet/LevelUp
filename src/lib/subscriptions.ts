import fs from 'fs';
import path from 'path';
import { XP_PER_LEVEL } from '@/lib/progression';

export type SubscriptionTier = 'FREE' | 'PRO' | 'PREMIUM';

export type SubscriptionStatus = 'ACTIVE' | 'PENDING' | 'CANCELLED' | 'EXPIRED' | 'SUSPENDED';

type PlanMap = Record<string, SubscriptionTier>;

const FILE = path.join(process.cwd(), 'data', 'user-subscriptions.json');
const META_FILE = path.join(process.cwd(), 'data', 'user-subscription-meta.json');
const DEFAULTS: PlanMap = { 'tyrone.rosejr@gmail.com': 'PRO' };

export type SubscriptionMeta = {
  email: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  paypalSubscriptionId?: string | null;
  paypalPlanId?: string | null;
  startedAt?: string | null;
  expiresAt?: string | null;
  updatedAt?: string | null;
};

export type SubscriptionMetaMap = Record<string, SubscriptionMeta>;

function normalizeEmail(email?: string | null) {
  return String(email || '').trim().toLowerCase();
}

export function readSubscriptionMap(): PlanMap {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(DEFAULTS, null, 2));
    } catch {}
    return { ...DEFAULTS };
  }
}

export function writeSubscriptionMap(map: PlanMap) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(map, null, 2));
}

export function getSubscriptionTierByEmail(email?: string | null): SubscriptionTier {
  const key = normalizeEmail(email);
  if (!key) return 'FREE';
  const meta = getSubscriptionMetaByEmail(key);
  if (meta) {
    return meta.status === 'ACTIVE' ? meta.tier : 'FREE';
  }
  return readSubscriptionMap()[key] || 'FREE';
}

export function setSubscriptionTierByEmail(email: string, tier: SubscriptionTier) {
  const key = normalizeEmail(email);
  if (!key) return;
  const map = readSubscriptionMap();
  map[key] = tier;
  writeSubscriptionMap(map);
}


export function readSubscriptionMetaMap(): SubscriptionMetaMap {
  try {
    const raw = fs.readFileSync(META_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    try {
      fs.mkdirSync(path.dirname(META_FILE), { recursive: true });
      fs.writeFileSync(META_FILE, JSON.stringify({}, null, 2));
    } catch {}
    return {};
  }
}

export function writeSubscriptionMetaMap(map: SubscriptionMetaMap) {
  fs.mkdirSync(path.dirname(META_FILE), { recursive: true });
  fs.writeFileSync(META_FILE, JSON.stringify(map, null, 2));
}

export function getSubscriptionMetaByEmail(email?: string | null): SubscriptionMeta | null {
  const key = normalizeEmail(email);
  if (!key) return null;
  const meta = readSubscriptionMetaMap()[key];
  if (!meta) return null;
  if (meta.expiresAt) {
    const expiry = new Date(meta.expiresAt).getTime();
    if (Number.isFinite(expiry) && expiry > 0 && Date.now() > expiry && meta.tier !== 'FREE') {
      const map = readSubscriptionMetaMap();
      map[key] = { ...meta, tier: 'FREE', status: 'EXPIRED', updatedAt: new Date().toISOString() };
      writeSubscriptionMetaMap(map);
      setSubscriptionTierByEmail(key, 'FREE');
      return map[key];
    }
  }
  return meta;
}

export function setSubscriptionMetaByEmail(email: string, metaPatch: Partial<SubscriptionMeta> & { tier?: SubscriptionTier; status?: SubscriptionStatus }) {
  const key = normalizeEmail(email);
  if (!key) return null;
  const map = readSubscriptionMetaMap();
  const current = map[key] || { email: key, tier: 'FREE' as SubscriptionTier, status: 'ACTIVE' as SubscriptionStatus };
  const next = {
    ...current,
    ...metaPatch,
    email: key,
    updatedAt: new Date().toISOString(),
  } as SubscriptionMeta;
  map[key] = next;
  writeSubscriptionMetaMap(map);
  if (next.tier) {
    const effectiveTier = next.status === 'ACTIVE' ? next.tier : (next.tier === 'FREE' ? 'FREE' : 'FREE');
    setSubscriptionTierByEmail(key, effectiveTier);
  }
  return next;
}

export function downgradeSubscriptionByEmail(email: string, status: SubscriptionStatus = 'EXPIRED') {
  return setSubscriptionMetaByEmail(email, {
    tier: 'FREE',
    status,
    expiresAt: new Date().toISOString(),
  });
}

export function xpCapForTier(tier: SubscriptionTier) {
  if (tier === 'FREE') return XP_PER_LEVEL * 3 - 1; // free can reach level 3, level 4 requires paid tier
  return Number.MAX_SAFE_INTEGER;
}

export function capXpForTier(xp: number, tier: SubscriptionTier) {
  return Math.min(Math.max(0, Math.floor(xp || 0)), xpCapForTier(tier));
}
