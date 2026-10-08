
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


const STORE: Stage9StoreItem[] = [
  { id: "shield_charge", name: "Shield Charge", cost: 30, description: "Adds one extra shield use to your inventory.", itemType: "POWERUP", quantity: 1, badge: "Defense" },
  { id: "health_restore", name: "Health Restore", cost: 40, description: "Restores 25% of maximum player HP during a battle.", itemType: "POWERUP", quantity: 1, badge: "Healing" },
  { id: "fury_charge", name: "Fury Charge", cost: 45, description: "Adds one fury burst for tougher sessions.", itemType: "POWERUP", quantity: 1, badge: "Damage" },
  { id: "hint_discount", name: "Hint Discount", cost: 35, description: "Banks one reduced-cost hint for a future run.", itemType: "BOOST", quantity: 1, badge: "Support" },
  { id: "extra_life", name: "Boss Extra Life", cost: 80, description: "Stores one extra life for boss battle runs.", itemType: "BOSS", quantity: 1, badge: "Boss" },
  { id: "xp_surge", name: "XP Surge", cost: 60, description: "Adds 50% XP to the current answer; expires after that answer.", itemType: "BOOST", quantity: 1, badge: "XP" },
];

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function yesterdayKey(date = new Date()) {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}


export function getStoreCatalog() {
  return STORE;
}

export async function readLedger(userId: string): Promise<Stage9Ledger> {
  const key = String(userId || "").trim();
  const row = await prisma.userEconomyState.findUnique({ where: { userId: key } });
  return row ? { userId: key, streakDays: row.streakDays, lastClaimDate: row.lastClaimDate, lastSeenDate: row.lastSeenDate } : { userId: key, streakDays: 0, lastClaimDate: null, lastSeenDate: null };
}

export async function touchUserActivity(userId: string, now = new Date()): Promise<Stage9Ledger> {
  const key = String(userId || "").trim();
  if (!key) return { userId: key, streakDays: 0, lastClaimDate: null, lastSeenDate: null };
  const today = dayKey(now);
  const yesterday = yesterdayKey(now);
  return prisma.$transaction(async (tx): Promise<Stage9Ledger> => {
    await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', key);
    const current = await tx.userEconomyState.findUnique({ where: { userId: key } });
    let streakDays = Math.max(0, Number(current?.streakDays || 0));
    if (!current?.lastSeenDate) streakDays = Math.max(1, streakDays || 1);
    else if (current.lastSeenDate === today) streakDays = Math.max(1, streakDays || 1);
    else if (current.lastSeenDate === yesterday) streakDays = Math.max(1, streakDays + 1);
    else streakDays = 1;
    const next = await tx.userEconomyState.upsert({
      where: { userId: key },
      update: { streakDays, lastSeenDate: today },
      create: { userId: key, streakDays, lastSeenDate: today },
    });
    return { userId: key, streakDays: next.streakDays, lastClaimDate: next.lastClaimDate, lastSeenDate: next.lastSeenDate };
  });
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
  const ledger = await touchUserActivity(userId);
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
  const touched = await touchUserActivity(key);
  const awarded = getDailyBonusAmount(touched.streakDays);
  const claimKey = `daily-bonus:${key}:${today}`;

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', key);
      const state = await tx.userEconomyState.findUnique({ where: { userId: key } });
      if (state?.lastClaimDate === today) {
        const wallet = await tx.wallet.findUnique({ where: { userId: key } });
        return { ok: true as const, alreadyClaimed: true, awarded: 0, streakDays: state.streakDays, dailyBonusTokens: getDailyBonusAmount(state.streakDays), walletTokens: wallet?.tokenBalance || 0 };
      }

      await tx.rewardClaim.create({
        data: {
          userId: key,
          claimKey,
          kind: "STAGE9_DAILY_BONUS",
          meta: { date: today, awarded, streakDays: touched.streakDays },
        },
      });

      await tx.userEconomyState.upsert({
        where: { userId: key },
        update: { lastClaimDate: today },
        create: { userId: key, streakDays: Math.max(1, touched.streakDays), lastSeenDate: today, lastClaimDate: today },
      });
      const wallet = await tx.wallet.upsert({
        where: { userId: key },
        update: { tokenBalance: { increment: awarded } },
        create: { userId: key, tokenBalance: awarded },
      });
      try {
        await tx.notification.create({ data: { userId: key, type: "STAGE9_DAILY_BONUS", title: "Daily streak bonus claimed", body: `You claimed +${awarded} tokens for keeping your streak alive.` } as any });
      } catch {}
      return { ok: true as const, alreadyClaimed: false, awarded, streakDays: touched.streakDays, walletTokens: wallet.tokenBalance };
    });
  } catch (error: any) {
    if (error?.code !== "P2002") throw error;
    const [state, wallet] = await Promise.all([
      prisma.userEconomyState.findUnique({ where: { userId: key } }),
      prisma.wallet.findUnique({ where: { userId: key } }),
    ]);
    const streakDays = state?.streakDays || touched.streakDays;
    return { ok: true as const, alreadyClaimed: true, awarded: 0, streakDays, dailyBonusTokens: getDailyBonusAmount(streakDays), walletTokens: wallet?.tokenBalance || 0 };
  }
}

export async function purchaseStage9Item(userId: string, itemId: string, options?: { free?: boolean; actionKey?: string }) {
  const item = STORE.find((x) => x.id === itemId);
  if (!item) return { ok: false as const, error: "Item not found" };
  if (!options?.actionKey || options.actionKey.length > 200) return {ok:false as const,error:"actionKey required"};
  await prisma.wallet.upsert({ where: { userId }, update: {}, create: { userId, tokenBalance: 0 } });
  const free = Boolean(options?.free);
  const next = await prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', userId);
    const claimKey = `store:${userId}:${options.actionKey}`;
    const prior = await tx.rewardClaim.findUnique({where:{claimKey}});
    if (prior) {
      if ((prior.meta as any)?.itemId !== itemId) throw new Error("Action key already used for another item");
      return {tokenBalance:Number((prior.meta as any)?.tokenBalance || 0)};
    }
    if (!free) {
      const debited = await tx.wallet.updateMany({
        where: { userId, tokenBalance: { gte: item.cost } },
        data: { tokenBalance: { decrement: item.cost } },
      });
      if (debited.count !== 1) throw new Error("Not enough tokens");
    }
    const updatedWallet = await tx.wallet.findUnique({ where: { userId } });
    if (!updatedWallet) throw new Error("Wallet not found");
    const existing = await tx.inventoryItem.findFirst({ where: { userId, itemType: item.itemType, itemRef: item.id } });
    if (existing) {
      await tx.inventoryItem.update({ where: { id: existing.id }, data: { quantity: { increment: item.quantity } } });
    } else {
      await tx.inventoryItem.create({ data: { userId, itemType: item.itemType, itemRef: item.id, quantity: item.quantity } });
    }
    try {
      await tx.notification.create({ data: { userId, type: "STAGE9_STORE_PURCHASE", title: `${item.name} purchased`, body: free ? `Admin purchase • ${item.description}` : `-${item.cost} tokens • ${item.description}` } as any });
    } catch {}
    await tx.rewardClaim.create({data:{userId,claimKey,kind:"STORE_PURCHASE",meta:{itemId,tokenBalance:updatedWallet.tokenBalance,charged:free ? 0 : item.cost}}});
    return updatedWallet;
  });
  return { ok: true as const, walletTokens: Number((next as any)?.tokenBalance || 0), item, charged: free ? 0 : item.cost, adminBypass: free };
}


export async function useStage9Item(userId: string, itemId: string, actionKey: string, context?: {sessionQuestionId:string}) {
  const key = String(userId || "").trim();
  if (!key) return { ok: false as const, error: "userId required" };
  if (!STORE.some(item => item.id === itemId)) return { ok: false as const, error: "Unsupported item" };
  if (!actionKey || actionKey.length > 200) return { ok: false as const, error: "actionKey required" };
  return prisma.$transaction<{ ok: boolean; error?: string; remaining?: number; replayed?: boolean }>(async (tx: any) => {
  // Serialize this user's consumption, including retries and multiple inventory rows.
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${key} FOR UPDATE`;
  const claimKey = `use-item:${key}:${actionKey}`;
  const prior = await tx.rewardClaim.findUnique({ where: { claimKey } });
  if (prior) {
    if (prior.meta?.itemId !== itemId) return { ok: false as const, error: "Action key already used for another item" };
    return { ok: true as const, remaining: Number(prior.meta.remaining || 0), replayed: true };
  }
  if (context) {
    await tx.$queryRawUnsafe('SELECT "id" FROM "GameSessionQuestion" WHERE "id" = $1 FOR UPDATE',context.sessionQuestionId);
    const question = await tx.gameSessionQuestion.findUnique({where:{id:context.sessionQuestionId},include:{session:true}});
    if (!question || question.session.userId !== key || question.session.status !== "ACTIVE" || (question.answered && itemId !== "extra_life") || (itemId === "extra_life" && question.session.trainingMode !== "BOSS")) return {ok:false,error:"Active owned battle question required"};
  }
  const existing = await tx.inventoryItem.findFirst({
    where: { userId: key, itemRef: itemId, quantity: { gt: 0 } },
    orderBy: { createdAt: "asc" },
  });
  if (!existing) return { ok: false as const, error: "Item not available" };
  const result = await tx.inventoryItem.updateMany({
    where: { id: existing.id, userId: key, quantity: { gt: 0 } },
    data: { quantity: { decrement: 1 } },
  });
  if (result.count !== 1) return { ok: false as const, error: "Item not available" };
  const rows = await tx.inventoryItem.findMany({ where: { userId: key, itemRef: itemId } });
  const remaining = rows.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.quantity || 0)), 0);
  await tx.rewardClaim.create({ data: { userId: key, claimKey, kind: "ITEM_USE", meta: { itemId, remaining } } });
  return { ok: true as const, remaining };
  });
}

async function obsoleteAwardSessionRewards(userId: string, input: { correctCount?: number; totalQuestions?: number; outcome?: string | null; encounterType?: string | null; bestStreak?: number; }) {
  const key = String(userId || "").trim();
  if (!key) return { ok: false as const, error: "userId required" };
  const correctCount = Math.max(0, Number(input.correctCount || 0));
  const totalQuestions = Math.max(0, Number(input.totalQuestions || 0));
  const bestStreak = Math.max(0, Number(input.bestStreak || 0));
  const outcome = String(input.outcome || "").toLowerCase();
  const encounterType = String(input.encounterType || "standard").toLowerCase();
  await touchUserActivity(key);

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
