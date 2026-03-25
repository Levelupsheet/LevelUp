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

function ensureDataDir() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
  } catch {}
}

function safeReadJson<T>(file: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as T : fallback;
  } catch {
    return fallback;
  }
}

function safeWriteJson(file: string, value: unknown) {
  try {
    ensureDataDir();
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
    return true;
  } catch {
    return false;
  }
}

export function readSubscriptionMap(): PlanMap {
  return { ...DEFAULTS, ...safeReadJson<Record<string, SubscriptionTier>>(FILE, {}) };
}

export function writeSubscriptionMap(map: PlanMap) {
  safeWriteJson(FILE, map);
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
  return safeReadJson<SubscriptionMetaMap>(META_FILE, {});
}

export function writeSubscriptionMetaMap(map: SubscriptionMetaMap) {
  safeWriteJson(META_FILE, map);
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
