import { prisma } from "@/lib/prisma";
import { ensureUser } from "@/app/api/_lib/ensureUser";
import { BOSS_BONUS_XP, GOLDEN_BOSS_RAFFLE_REWARD } from "@/lib/bossBattle";
import { awardRaffleEntries } from "@/lib/raffle";
import type { LearningAnswerEvent } from "@/lib/learningProfile";
import { getSessionUser } from "@/lib/auth/session";

type BossCompleteBody = {
  encounterId?: string;
  userId?: string;
  outcome?: "victory" | "defeat" | "complete" | null;
  xpEarned?: number;
  correctCount?: number;
  totalQuestions?: number;
  answerEvents?: LearningAnswerEvent[];
  hintXpSpent?: number;
  hintsUsedCount?: number;
  hintsUsed?: Array<{ questionId?: string; hintType?: string; cost?: number; usedAt?: string }>;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as BossCompleteBody;
    const encounterId = String(body.encounterId || "").trim();
    const sessionUser = await getSessionUser();
    const userId = String(sessionUser?.id || "").trim();
    if (!userId) return Response.json({ ok: false, error: "Sign in required" }, { status: 401 });
    if (!encounterId) return Response.json({ ok: false, error: "encounterId required" }, { status: 400 });

    const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!existing) await ensureUser(userId);

    const result = await prisma.$transaction(async (tx) => {
      const encounter = await tx.bossEncounter.findUnique({ where: { id: encounterId } });
      if (!encounter || encounter.userId !== userId) throw new Error("Boss encounter not found");
      if (encounter.outcome !== "PENDING") return { alreadyProcessed: true, encounter, bonusXpAwarded: 0, raffleEntriesAwarded: 0, lootChestAwarded: null, powerupsAwarded: [] };

      const win = body.outcome === "victory";
      const xpFromQuestions = Math.max(0, Math.floor(Number(body.xpEarned || 0)));
      const hintXpSpent = Math.max(0, Math.floor(Number(body.hintXpSpent || 0)));
      const hintsUsedCount = Math.max(0, Math.floor(Number(body.hintsUsedCount || 0)));
      const bonusXpAwarded = win ? BOSS_BONUS_XP : 0;
      const totalXp = xpFromQuestions + bonusXpAwarded - hintXpSpent;

      let raffleEntriesAwarded = 0;
      let lootChestAwarded: { id: string; type: string } | null = null;
      const powerupsAwarded: Array<{ itemRef: string; quantity: number }> = [];
      if (win) {
        const awarded = await awardRaffleEntries(tx as any, {
          userId,
          source: encounter.isGolden ? "GOLDEN_BOSS" : "BOSS_BATTLE",
          quantity: encounter.isGolden ? GOLDEN_BOSS_RAFFLE_REWARD : 1,
          meta: { encounterId, bossName: encounter.bossName, golden: encounter.isGolden } as any,
          sourceRefType: "BOSS_ENCOUNTER",
          sourceRefId: encounterId,
          auditKey: `boss:${userId}:${encounterId}`,
        });
        raffleEntriesAwarded = awarded.awarded;

        // Every boss victory grants one unopened loot chest. Golden bosses
        // upgrade the guaranteed chest from SILVER to GOLD.
        const chest = await tx.lootBox.create({
          data: {
            userId,
            type: encounter.isGolden ? "GOLD" : "SILVER",
            status: "PENDING",
            source: encounter.isGolden ? "golden_boss_victory" : "boss_victory",
          },
          select: { id: true, type: true },
        });
        lootChestAwarded = { id: chest.id, type: chest.type };

        // Guaranteed combat powerups are granted directly to inventory in
        // addition to whatever the loot chest contains when opened.
        const powerupDrops = encounter.isGolden
          ? [{ itemRef: "shield_charge", quantity: 1 }, { itemRef: "health_restore", quantity: 1 }, { itemRef: "fury_charge", quantity: 1 }]
          : [{ itemRef: "shield_charge", quantity: 1 }, { itemRef: "health_restore", quantity: 1 }];

        for (const drop of powerupDrops) {
          const existingItem = await tx.inventoryItem.findFirst({
            where: { userId, itemType: "POWERUP", itemRef: drop.itemRef },
            orderBy: { createdAt: "asc" },
          });
          if (existingItem) {
            await tx.inventoryItem.update({
              where: { id: existingItem.id },
              data: { quantity: { increment: drop.quantity } },
            });
          } else {
            await tx.inventoryItem.create({
              data: { userId, itemType: "POWERUP", itemRef: drop.itemRef, quantity: drop.quantity },
            });
          }
          powerupsAwarded.push(drop);
        }

        await tx.notification.create({
          data: {
            userId,
            type: "LOOT_BOX_EARNED",
            title: encounter.isGolden ? "Golden Boss rewards unlocked!" : "Boss rewards unlocked!",
            body: encounter.isGolden
              ? "Victory awarded a Gold loot chest plus Shield, Health Restore, and Fury powerups."
              : "Victory awarded a Silver loot chest plus Shield and Health Restore powerups.",
          },
        }).catch(() => null);
      }

      const currentUser = await tx.user.findUnique({ where: { id: userId }, select: { xp: true } });
      const user = await tx.user.update({
        where: { id: userId },
        data: { xp: Math.max(0, Number(currentUser?.xp || 0) + totalXp), lastActiveAt: new Date() },
        select: { id: true, xp: true },
      });

      const updatedEncounter = await tx.bossEncounter.update({
        where: { id: encounterId },
        data: {
          outcome: win ? "VICTORY" : "DEFEAT",
          correctCount: Math.max(0, Math.floor(Number(body.correctCount || 0))),
          totalQuestions: Math.max(1, Math.floor(Number(body.totalQuestions || encounter.totalQuestions || 3))),
          xpFromQuestions,
          bonusXpAwarded,
          raffleEntriesAwarded,
          answerEventsJson: (Array.isArray(body.answerEvents) ? body.answerEvents : []) as any,
          resultMetaJson: {
            hintXpSpent,
            hintsUsedCount,
            hintsUsed: Array.isArray(body.hintsUsed) ? body.hintsUsed : [],
            answeredQuestions: Math.max(1, Math.floor(Number(body.totalQuestions || encounter.totalQuestions || 3))),
            accuracy: Number((((Number(body.correctCount || 0)) / Math.max(1, Number(body.totalQuestions || encounter.totalQuestions || 3))) * 100).toFixed(1)),
            outcome: win ? "VICTORY" : "DEFEAT",
          } as any,
          completedAt: new Date(),
        },
      });

      return { user, encounter: updatedEncounter, bonusXpAwarded, raffleEntriesAwarded, lootChestAwarded, powerupsAwarded };
    });

    return Response.json(Object.assign({ ok: true }, result as any));
  } catch (err: any) {
    console.error("Boss battle completion failed", err);
    return Response.json({ ok: false, error: "Failed to complete boss battle" }, { status: 500 });
  }
}
