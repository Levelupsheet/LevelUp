import { NextResponse } from "next/server";
import { prisma } from "../../_lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { reconcileLevelLoot } from "@/lib/levelLoot";
/** Reconcile rewards against saved server XP, including missed level-up chests. */
export async function POST() {
  try {
    const userId = String((await getSessionUser())?.id || "");
    if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const result = await prisma.$transaction(async tx => {
      const reward = await reconcileLevelLoot(tx, userId);
      const pendingCount = await tx.lootBox.count({ where: { userId, status: "PENDING" } });
      return { ...reward, pendingCount };
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Loot reconciliation failed", error);
    return NextResponse.json({ error: "Failed to earn loot." }, { status: 500 });
  }
}
