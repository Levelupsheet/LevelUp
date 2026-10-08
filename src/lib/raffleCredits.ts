import { awardRaffleEntries } from "@/lib/raffle";

/** Convert historical or capped chest-entry inventory into real entries, preserving capped balance. */
export async function redeemRaffleCredits(tx: any, userId: string, award = awardRaffleEntries) {
  await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE',userId);
  const credits = await tx.inventoryItem.findMany({where:{userId,itemType:"RAFFLE_ENTRY",quantity:{gt:0}},orderBy:{createdAt:"asc"}});
  let awarded = 0;
  for (const credit of credits) {
    const grant = await award(tx,{userId,source:"CHEST_REWARD",quantity:credit.quantity,auditKey:`raffle-credit:${credit.id}:${credit.quantity}`,meta:{inventoryCreditId:credit.id}});
    if (!grant.awarded) break;
    await tx.inventoryItem.update({where:{id:credit.id},data:{quantity:{decrement:grant.awarded}}});
    awarded += grant.awarded;
  }
  return {awarded};
}
