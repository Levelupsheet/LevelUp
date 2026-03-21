import { NextResponse } from "next/server";
import { prisma } from "../../_lib/prisma";
import { ensureUser } from "../../_lib/ensureUser";
import { readLootVaultRows } from "@/lib/lootVault";

type LootBoxType = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM" | "DIAMOND";

type DropSpec = {
  rewardType: "TOKENS" | "XP_BOOST" | "BADGE" | "RAFFLE_ENTRY" | "COUPON" | "PRIZE";
  rewardRef?: string | null;
  quantity: number;
  rarity: string;
  visualIcon?: string | null;
  visualImageUrl?: string | null;
};

function pickWeighted<T>(items: { item: T; w: number }[]): T {
  const total = items.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const x of items) {
    r -= x.w;
    if (r <= 0) return x.item;
  }
  return items[items.length - 1].item;
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function generateBronzeDrops(): Promise<DropSpec[]> {
  const rows = (await readLootVaultRows().catch(() => [])).filter((row) => row.isActive !== false && Number(row.dropWeight ?? 0) > 0);
  const customPool = rows.map((row: any) => {
    let rewardType: DropSpec["rewardType"] = "PRIZE";
    let quantity = 1;
    if (String(row.type) === "SWEEPSTAKES_ENTRY") { rewardType = "RAFFLE_ENTRY"; quantity = Math.max(1, Number(row.sweepstakesEntries || 1)); }
    else if (String(row.type) === "CASH_OUT") { rewardType = "COUPON"; }
    else if (String(row.type) === "MERCH") { rewardType = "PRIZE"; }
    return {
      w: Math.max(1, Number(row.dropWeight || 1)),
      item: {
        rewardType,
        rewardRef: row.name,
        quantity,
        rarity: rewardType === "RAFFLE_ENTRY" ? "rare" : "uncommon",
        visualIcon: row.spinnerSymbol || null,
        visualImageUrl: row.iconUrl || null,
      } as DropSpec,
    };
  });

  const basePool: { item: DropSpec; w: number }[] = [
    { w: 70, item: { rewardType: "TOKENS", quantity: randInt(10, 30), rarity: "common", visualIcon: "🪙" } },
    { w: 25, item: { rewardType: "XP_BOOST", rewardRef: "xp_boost_small", quantity: randInt(50, 150), rarity: "uncommon", visualIcon: "⚡" } },
    { w: 5, item: { rewardType: "BADGE", rewardRef: pickWeighted([{ w: 60, item: "Consistency" }, { w: 40, item: "Quick Learner" }]), quantity: 1, rarity: "rare", visualIcon: "🏅" } },
  ];
  const primary = pickWeighted<DropSpec>([...basePool, ...customPool]);
  const bonus = Math.random() < 0.22;
  return bonus ? [primary, { rewardType: "TOKENS", quantity: randInt(5, 12), rarity: "common", visualIcon: "🪙" }] : [primary];
}

async function generateDropsForType(type: LootBoxType): Promise<DropSpec[]> {
  if (type === "BRONZE") return generateBronzeDrops();
  if (type === "SILVER") {
    const base = await generateBronzeDrops();
    base.push({ rewardType: "TOKENS", quantity: randInt(15, 40), rarity: "uncommon", visualIcon: "🪙" });
    return base;
  }
  if (type === "GOLD") {
    return [
      { rewardType: "TOKENS", quantity: randInt(40, 90), rarity: "rare", visualIcon: "🪙" },
      { rewardType: "RAFFLE_ENTRY", quantity: 1, rarity: "rare", visualIcon: "🎟️" },
    ];
  }
  if (type === "PLATINUM") {
    return [
      { rewardType: "TOKENS", quantity: randInt(90, 180), rarity: "epic", visualIcon: "🪙" },
      { rewardType: "RAFFLE_ENTRY", quantity: 2, rarity: "epic", visualIcon: "🎟️" },
    ];
  }
  return [
    { rewardType: "PRIZE", rewardRef: "Diamond Prize Pool", quantity: 1, rarity: "legendary", visualIcon: "💎" },
    { rewardType: "TOKENS", quantity: randInt(150, 350), rarity: "legendary", visualIcon: "🪙" },
  ];
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userId = String(body?.userId ?? "");
    const countReq = body?.count;
    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    // Ensure user exists (demo/local mode)
    await ensureUser(userId);

    // If Prisma client is stale (missing models), fail gracefully with a clear message.
    if (!(prisma as any).lootBox) {
      return NextResponse.json({ error: "Prisma client is missing LootBox model. Run: npx prisma generate && npx prisma migrate dev" }, { status: 500 });
    }

    const opened = await prisma.$transaction(async (tx: any) => {
      const pending = await tx.lootBox.findMany({
        where: { userId, status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: countReq === "all" ? 50 : Math.max(1, Math.min(10, Number(countReq ?? 1))),
      });

      if (!pending.length) return [] as any[];

      const out: any[] = [];

      for (const box of pending) {
        const drops = await generateDropsForType(box.type as LootBoxType);

        await tx.lootBox.update({
          where: { id: box.id },
          data: { status: "OPENED", openedAt: new Date() },
        });

        await tx.lootDrop.createMany({
          data: drops.map((d) => ({
            lootBoxId: box.id,
            rewardType: d.rewardType,
            rewardRef: d.rewardRef ?? null,
            quantity: d.quantity,
            rarity: d.rarity,
          })),
        });

        out.push({
          lootBoxId: box.id,
          boxType: box.type,
          drops: drops.map((d) => ({
            rewardType: d.rewardType,
            rewardRef: d.rewardRef ?? null,
            quantity: d.quantity,
            rarity: d.rarity,
          })),
        });
      }

      return out;
    });

    return NextResponse.json({ opened });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}
