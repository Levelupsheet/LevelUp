import { NextResponse } from "next/server";
import { prisma } from "../../_lib/prisma";
import { ensureUser } from "../../_lib/ensureUser";
import { applyUserXpIncrement } from "@/lib/xpCaps";
import { getSessionUser } from "@/lib/auth/session";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sessionUser = await getSessionUser();
    const userId = String(sessionUser?.id || "").trim();
    const lootBoxIds = Array.isArray(body?.lootBoxIds) ? (body.lootBoxIds as string[]) : [];

    if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    await ensureUser(userId);

    if (!(prisma as any).lootBox) {
      return NextResponse.json(
        { error: "Prisma client is missing LootBox model. Run: npx prisma generate && npx prisma migrate dev" },
        { status: 500 }
      );
    }
    if (!lootBoxIds.length) return NextResponse.json({ error: "Missing lootBoxIds" }, { status: 400 });

    const result = await prisma.$transaction(async (tx: any) => {
      // Ensure wallet exists
      const wallet = await tx.wallet.upsert({
        where: { userId },
        update: {},
        create: { userId, tokenBalance: 0 },
      });

      const boxes = await tx.lootBox.findMany({
        where: { id: { in: lootBoxIds }, userId },
        include: { drops: true },
      });

      const claimable = boxes.filter((b) => b.status === "OPENED");
      if (!claimable.length) return { claimed: 0, tokenBalance: wallet.tokenBalance, xpAdded: 0 };

      let tokensToAdd = 0;
      let xpToAdd = 0;
      const claimedBoxIds: string[] = [];

      for (const box of claimable) {
        const reserved = await tx.lootBox.updateMany({
          where: { id: box.id, userId, status: "OPENED" },
          data: { status: "CLAIMED", claimedAt: new Date() },
        });
        if (reserved.count !== 1) continue;
        claimedBoxIds.push(box.id);

        for (const d of box.drops) {
          if (d.rewardType === "TOKENS") {
            tokensToAdd += d.quantity;
            continue;
          }
          if (d.rewardType === "XP_BOOST") {
            // XP rewards apply directly to the user's profile XP
            xpToAdd += d.quantity;
            // Also store in inventory history
            await tx.inventoryItem.create({
              data: { userId, itemType: "XP_BOOST", itemRef: d.rewardRef, quantity: d.quantity },
            });
            continue;
          }

          // Everything else goes to inventory
          await tx.inventoryItem.create({
            data: {
              userId,
              itemType: d.rewardType,
              itemRef: d.rewardRef,
              quantity: d.quantity,
            },
          });
        }
      }

      const updatedWallet = await tx.wallet.update({
        where: { userId },
        data: { tokenBalance: { increment: tokensToAdd } },
      });

      if (xpToAdd > 0) {
        await applyUserXpIncrement(tx, userId, xpToAdd);
      }

      // Clear LOOT notifications after claiming (server-side)
      await tx.notification.updateMany({
        where: { userId, type: "LOOT_BOX_EARNED", readAt: null },
        data: { readAt: new Date() },
      });

      return { claimed: claimedBoxIds.length, tokenBalance: updatedWallet.tokenBalance, tokensAdded: tokensToAdd, xpAdded: xpToAdd };
    });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}
