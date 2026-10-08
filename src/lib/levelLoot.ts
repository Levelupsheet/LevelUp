import { levelFromXp } from "@/lib/progression";

/** One Bronze chest per reached level, including the level-one welcome chest.
 * Run inside the caller's transaction. Marker is informational, never proof of a grant.
 */
export async function reconcileLevelLoot(tx: any, userId: string) {
  await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', userId);
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  const levelNow = levelFromXp(Number(user.xp || 0));
  const existing = await tx.lootBox.findMany({ where: { userId, source: { startsWith: "LEVEL_UP:" } }, select: { source: true } });
  const awardedLevels = new Set(existing.map((box: any) => Number(String(box.source).split(":")[1])));
  const existingClaims = await tx.rewardClaim.findMany({where:{userId,kind:"LEVEL_LOOT"},select:{claimKey:true}});
  const claimed = new Set(existingClaims.map((row: any) => row.claimKey));
  const levels = Array.from({length:levelNow},(_,index) => index + 1).filter(level => !claimed.has(`level-loot:${userId}:${level}`));
  const reserved = levels.length ? await tx.rewardClaim.createMany({ data: levels.map(level => ({ userId, claimKey: `level-loot:${userId}:${level}`, kind: "LEVEL_LOOT", meta: { level } })), skipDuplicates: true }) : {count:0};
  if (reserved.count && reserved.count !== levels.length) throw new Error("Level reward reservation conflict; retry transaction");
  const missing = reserved.count ? levels.filter(level => !awardedLevels.has(level)) : [];
  if (missing.length) {
    await tx.lootBox.createMany({ data: missing.map(level => ({ userId, type: "BRONZE", status: "PENDING", source: `LEVEL_UP:${level}` })) });
    await tx.notification.create({ data: { userId, type: "LOOT_BOX_EARNED", title: "Level up loot chest earned", body: `Level ${levelNow} • ${missing.length} Bronze loot chest${missing.length === 1 ? "" : "s"} ready to open.` } });
  }
  await tx.user.updateMany({ where: { id: userId, lootGrantedUpToLevel: Number(user.lootGrantedUpToLevel || 0) }, data: { lootGrantedUpToLevel: Math.max(levelNow, Number(user.lootGrantedUpToLevel || 0)) } });
  return { created: missing.length, levelNow, skipped: !missing.length };
}
