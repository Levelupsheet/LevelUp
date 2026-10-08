import { NextResponse } from "next/server";
import { prisma } from "../../_lib/prisma";
import { ensureUser } from "../../_lib/ensureUser";
import { applyUserXpIncrement } from "@/lib/xpCaps";
import { getSessionUser } from "@/lib/auth/session";
import { awardRaffleEntries } from "@/lib/raffle";
import { redeemRaffleCredits } from "@/lib/raffleCredits";

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
      await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', userId);
      const recovered = await redeemRaffleCredits(tx,userId);
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
      let raffleEntriesAwarded = recovered.awarded;
      let raffleEntriesDeferred = 0;
      const claimedBoxIds: string[] = [];

      for (const box of claimable) {
        const reserved = await tx.lootBox.updateMany({
          where: { id: box.id, userId, status: "OPENED" },
          data: { status: "CLAIMED", claimedAt: new Date() },
        });
        if (reserved.count !== 1) continue;
        claimedBoxIds.push(box.id);

        for (const d of box.drops) {
          if (d.rewardType === "RAFFLE_ENTRY") {
            const grant = await awardRaffleEntries(tx, { userId, source: "CHEST_REWARD", quantity: d.quantity, sourceRefType: "LOOT_BOX", sourceRefId: box.id, auditKey: `loot-drop:${d.id}` });
            raffleEntriesAwarded += Number(grant.awarded || 0);
            const deferred = Math.max(0,d.quantity - Number(grant.awarded || 0));
            if (deferred) await tx.inventoryItem.create({data:{userId,itemType:"RAFFLE_ENTRY",itemRef:`loot-credit:${d.id}`,quantity:deferred}});
            raffleEntriesDeferred += deferred;
            continue;
          }
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
        const before = await tx.user.findUnique({where:{id:userId},select:{xp:true}});
        const after = await applyUserXpIncrement(tx, userId, xpToAdd);
        xpToAdd = Math.max(0,Number(after.xp || 0) - Number(before?.xp || 0));
      }

      // Clear LOOT notifications after claiming (server-side)
      const remainingBoxes = await tx.lootBox.count({where:{userId,status:{in:["PENDING","OPENED"]}}});
      if (!remainingBoxes) await tx.notification.updateMany({
        where: { userId, type: "LOOT_BOX_EARNED", readAt: null },
        data: { readAt: new Date() },
      });

      return { claimed: claimedBoxIds.length, tokenBalance: updatedWallet.tokenBalance, tokensAdded: tokensToAdd, xpAdded: xpToAdd, raffleEntriesAwarded, raffleEntriesDeferred };
    });

    return NextResponse.json(result);
  } catch (e: any) {
    console.error("Loot claim failed", e);
    return NextResponse.json({ error: "Failed to claim loot." }, { status: 500 });
  }
}
