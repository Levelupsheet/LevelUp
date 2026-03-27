
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

export type Stage9Ledger = {
  userId: string;
  streakDays: number;
  lastClaimDate: string | null;
  lastSeenDate: string | null;
};

export type Stage9StoreItem = {
  id: string;
  name: string;
  cost: number;
  description: string;
  itemType: string;
  quantity: number;
  badge: string;
};

export type Stage9Status = {
  streakDays: number;
  lastClaimDate: string | null;
  claimableToday: boolean;
  dailyBonusTokens: number;
  momentumLabel: string;
  nextHook: string;
  walletTokens: number;
  inventory: Array<{ itemType: string; itemRef: string | null; quantity: number }>;
  store: Stage9StoreItem[];
};

const FILE = path.join(process.cwd(), "data", "stage9-economy.json");

const STORE: Stage9StoreItem[] = [
  { id: "shield_charge", name: "Shield Charge", cost: 30, description: "Adds one extra shield use to your inventory.", itemType: "POWERUP", quantity: 1, badge: "Defense" },
  { id: "fury_charge", name: "Fury Charge", cost: 45, description: "Adds one fury burst for tougher sessions.", itemType: "POWERUP", quantity: 1, badge: "Damage" },
  { id: "hint_discount", name: "Hint Discount", cost: 35, description: "Banks one reduced-cost hint for a future run.", itemType: "BOOST", quantity: 1, badge: "Support" },
  { id: "extra_life", name: "Boss Extra Life", cost: 80, description: "Stores one extra life for boss battle runs.", itemType: "BOSS", quantity: 1, badge: "Boss" },
  { id: "xp_surge", name: "XP Surge", cost: 60, description: "Stores one 15 minute XP surge consumable.", itemType: "BOOST", quantity: 1, badge: "XP" },
];

function ensureDir() {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); } catch {}
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function yesterdayKey(date = new Date()) {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}

function readMap(): Record<string, Stage9Ledger> {
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, Stage9Ledger>) {
  ensureDir();
  fs.writeFileSync(FILE, JSON.stringify(map, null, 2));
}

export function getStoreCatalog() {
  return STORE;
}

export function readLedger(userId: string): Stage9Ledger {
  const key = String(userId || "").trim();
  const map = readMap();
  return map[key] || { userId: key, streakDays: 0, lastClaimDate: null, lastSeenDate: null };
}

export function touchUserActivity(userId: string, now = new Date()) {
  const key = String(userId || "").trim();
  if (!key) return readLedger(key);
  const today = dayKey(now);
  const yesterday = yesterdayKey(now);
  const map = readMap();
  const current = map[key] || { userId: key, streakDays: 0, lastClaimDate: null, lastSeenDate: null };
  let streakDays = Math.max(0, Number(current.streakDays || 0));
  if (!current.lastSeenDate) streakDays = Math.max(1, streakDays || 1);
  else if (current.lastSeenDate === today) streakDays = Math.max(1, streakDays || 1);
  else if (current.lastSeenDate === yesterday) streakDays = Math.max(1, streakDays + 1);
  else streakDays = 1;
  const next = { ...current, streakDays, lastSeenDate: today };
  map[key] = next;
  writeMap(map);
  return next;
}

export function getMomentumLabel(streakDays: number) {
  if (streakDays >= 14) return "Unstoppable";
  if (streakDays >= 7) return "Elite momentum";
  if (streakDays >= 3) return "Streak building";
  return "Fresh start";
}

export function getDailyBonusAmount(streakDays: number) {
  return Math.min(50, 10 + Math.max(0, streakDays - 1) * 5);
}

export function getEngagementHook(streakDays: number, walletTokens: number) {
  if (walletTokens < 30) return "One more session today can refill your wallet for a store pickup.";
  if (streakDays >= 7) return "Come back tomorrow to preserve your elite streak and collect a bigger token burst.";
  if (streakDays >= 3) return "You are close to elite momentum. Keep the streak alive tomorrow.";
  return "Start a short session tomorrow to stack your first streak bonus.";
}

export async function getStage9Status(userId: string): Promise<Stage9Status> {
  const ledger = touchUserActivity(userId);
  const wallet = await prisma.wallet.upsert({ where: { userId }, update: {}, create: { userId, tokenBalance: 0 } });
  const inventoryRows = await prisma.inventoryItem.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  const inventoryMap = new Map<string, { itemType: string; itemRef: string | null; quantity: number }>();
  for (const row of inventoryRows) {
    const key = `${row.itemType}:${row.itemRef || ""}`;
    const prev = inventoryMap.get(key) || { itemType: row.itemType, itemRef: row.itemRef || null, quantity: 0 };
    prev.quantity += Number(row.quantity || 0);
    inventoryMap.set(key, prev);
  }
  const claimableToday = ledger.lastClaimDate !== dayKey();
  return {
    streakDays: ledger.streakDays,
    lastClaimDate: ledger.lastClaimDate,
    claimableToday,
    dailyBonusTokens: getDailyBonusAmount(ledger.streakDays),
    momentumLabel: getMomentumLabel(ledger.streakDays),
    nextHook: getEngagementHook(ledger.streakDays, wallet.tokenBalance),
    walletTokens: wallet.tokenBalance,
    inventory: Array.from(inventoryMap.values()),
    store: getStoreCatalog(),
  };
}

export async function claimDailyBonus(userId: string) {
  const key = String(userId || "").trim();
  const today = dayKey();
  const touched = touchUserActivity(key);
  if (touched.lastClaimDate === today) {
    return { ok: true as const, alreadyClaimed: true, awarded: 0, streakDays: touched.streakDays, dailyBonusTokens: getDailyBonusAmount(touched.streakDays) };
  }
  const awarded = getDailyBonusAmount(touched.streakDays);
  const map = readMap();
  map[key] = { ...touched, lastClaimDate: today };
  writeMap(map);
  const wallet = await prisma.wallet.upsert({
    where: { userId: key },
    update: { tokenBalance: { increment: awarded } },
    create: { userId: key, tokenBalance: awarded },
  });
  try {
    await prisma.notification.create({ data: { userId: key, type: "STAGE9_DAILY_BONUS", title: "Daily streak bonus claimed", body: `You claimed +${awarded} tokens for keeping your streak alive.` } as any });
  } catch {}
  return { ok: true as const, alreadyClaimed: false, awarded, streakDays: touched.streakDays, walletTokens: wallet.tokenBalance };
}

export async function purchaseStage9Item(userId: string, itemId: string) {
  const item = STORE.find((x) => x.id === itemId);
  if (!item) return { ok: false as const, error: "Item not found" };
  const wallet = await prisma.wallet.upsert({ where: { userId }, update: {}, create: { userId, tokenBalance: 0 } });
  if ((wallet.tokenBalance || 0) < item.cost) {
    return { ok: false as const, error: "Not enough tokens", walletTokens: wallet.tokenBalance };
  }
  const next = await prisma.$transaction(async (tx) => {
    const updatedWallet = await tx.wallet.update({ where: { userId }, data: { tokenBalance: { decrement: item.cost } } });
    const existing = await tx.inventoryItem.findFirst({ where: { userId, itemType: item.itemType, itemRef: item.id } });
    if (existing) {
      await tx.inventoryItem.update({ where: { id: existing.id }, data: { quantity: { increment: item.quantity } } });
    } else {
      await tx.inventoryItem.create({ data: { userId, itemType: item.itemType, itemRef: item.id, quantity: item.quantity } });
    }
    try {
      await tx.notification.create({ data: { userId, type: "STAGE9_STORE_PURCHASE", title: `${item.name} purchased`, body: `-${item.cost} tokens • ${item.description}` } as any });
    } catch {}
    return updatedWallet;
  });
  return { ok: true as const, walletTokens: Number((next as any)?.tokenBalance || 0), item };
}


export async function useStage9Item(userId: string, itemId: string) {
  const key = String(userId || "").trim();
  if (!key) return { ok: false as const, error: "userId required" };
  const existing = await prisma.inventoryItem.findFirst({
    where: { userId: key, itemRef: itemId, quantity: { gt: 0 } },
    orderBy: { createdAt: "asc" },
  });
  if (!existing) return { ok: false as const, error: "Item not available" };
  const updated = await prisma.inventoryItem.update({ where: { id: existing.id }, data: { quantity: { decrement: 1 } } });
  return { ok: true as const, remaining: Math.max(0, Number(updated.quantity || 0)) };
}

export async function awardSessionRewards(userId: string, input: { correctCount?: number; totalQuestions?: number; outcome?: string | null; encounterType?: string | null; bestStreak?: number; }) {
  const key = String(userId || "").trim();
  if (!key) return { ok: false as const, error: "userId required" };
  const correctCount = Math.max(0, Number(input.correctCount || 0));
  const totalQuestions = Math.max(0, Number(input.totalQuestions || 0));
  const bestStreak = Math.max(0, Number(input.bestStreak || 0));
  const outcome = String(input.outcome || "").toLowerCase();
  const encounterType = String(input.encounterType || "standard").toLowerCase();
  touchUserActivity(key);

  let awarded = correctCount * 2;
  if (totalQuestions > 0 && correctCount === totalQuestions) awarded += 10;
  if (outcome === "victory" || outcome === "complete") awarded += 8;
  if (encounterType === "boss") awarded += 12;
  if (bestStreak >= 5) awarded += 6;
  awarded = Math.max(0, Math.floor(awarded));

  const wallet = await prisma.wallet.upsert({
    where: { userId: key },
    update: { tokenBalance: { increment: awarded } },
    create: { userId: key, tokenBalance: awarded },
  });
  try {
    await prisma.notification.create({
      data: {
        userId: key,
        type: "LOOT_BOX_EARNED" as any,
        title: `Session reward: +${awarded} tokens`,
        body: encounterType === "boss"
          ? `Boss run complete • ${correctCount}/${totalQuestions} correct • Wallet now ${wallet.tokenBalance}`
          : `Session complete • ${correctCount}/${totalQuestions} correct • Wallet now ${wallet.tokenBalance}`,
      } as any,
    });
  } catch {}
  return { ok: true as const, awarded, walletTokens: wallet.tokenBalance };
}
