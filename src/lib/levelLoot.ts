import { levelFromXp } from "@/lib/progression";
/** Run inside the caller's transaction. Reserve the level marker before minting. */
export async function reconcileLevelLoot(tx: any, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  const levelNow = levelFromXp(Number(user.xp || 0));
  const grantedUpTo = Number(user.lootGrantedUpToLevel || 0);
  if (levelNow <= grantedUpTo) return { created: 0, levelNow, skipped: true };
  const reserved = await tx.user.updateMany({
    where: { id: userId, lootGrantedUpToLevel: grantedUpTo },
    data: { lootGrantedUpToLevel: levelNow },
  });
  if (!reserved.count) return { created: 0, levelNow, skipped: true };
  // Older game completions created LEVEL_UP:n boxes without advancing the marker.
  const existing = await tx.lootBox.findMany({
    where: { userId, source: { startsWith: "LEVEL_UP:" } }, select: { source: true },
  });
  const awardedLevels = new Set(existing.map((box: any) => Number(String(box.source).split(":")[1])));
  const levels = Array.from({ length: levelNow - grantedUpTo }, (_, i) => grantedUpTo + i + 1)
    .filter(level => !awardedLevels.has(level));
  if (levels.length) {
    await tx.lootBox.createMany({ data: levels.map(level => ({ userId, type: "BRONZE", status: "PENDING", source: `LEVEL_UP:${level}` })) });
    await tx.notification.deleteMany({ where: { userId, type: "LOOT_BOX_EARNED", readAt: null, title: { in: ["Reward unlocked!", "Level up loot chest earned"] } } });
    await tx.notification.create({ data: { userId, type: "LOOT_BOX_EARNED", title: "Level up loot chest earned", body: `Level ${levelNow} reached • ${levels.length} Bronze loot chest${levels.length === 1 ? "" : "s"} ready to open.` } });
  }
  return { created: levels.length, levelNow, skipped: !levels.length };
}
