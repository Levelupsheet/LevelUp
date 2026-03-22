import fs from 'fs';
import path from 'path';
import { XP_PER_LEVEL } from '@/lib/progression';

export type SubscriptionTier = 'FREE' | 'PRO' | 'PREMIUM';

type PlanMap = Record<string, SubscriptionTier>;

const FILE = path.join(process.cwd(), 'data', 'user-subscriptions.json');
const DEFAULTS: PlanMap = { 'tyrone.rosejr@gmail.com': 'PRO' };

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
  return readSubscriptionMap()[key] || 'FREE';
}

export function setSubscriptionTierByEmail(email: string, tier: SubscriptionTier) {
  const key = normalizeEmail(email);
  if (!key) return;
  const map = readSubscriptionMap();
  map[key] = tier;
  writeSubscriptionMap(map);
}

export function xpCapForTier(tier: SubscriptionTier) {
  if (tier === 'FREE') return XP_PER_LEVEL * 2 - 1; // level 2 max
  return Number.MAX_SAFE_INTEGER;
}

export function capXpForTier(xp: number, tier: SubscriptionTier) {
  return Math.min(Math.max(0, Math.floor(xp || 0)), xpCapForTier(tier));
}
