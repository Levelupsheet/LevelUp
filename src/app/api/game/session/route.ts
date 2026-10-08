import { prisma } from "@/lib/prisma";
import { ensureUser } from "@/app/api/_lib/ensureUser";
import { getSessionUser } from "@/lib/auth/session";
import { inferDomainFromQuestion } from "@/lib/learningProfile";
import { applyUserXpIncrement } from "@/lib/xpCaps";
import { reconcileLevelLoot } from "@/lib/levelLoot";
import { levelFromXp } from "@/lib/progression";
import { settleCombat } from "@/lib/combatSettlement";
import { awardRaffleEntries, getOrCreateActiveGoldenSweepstakes } from "@/lib/raffle";
import { awardGoldenQuestion } from "@/lib/goldenRewards";
import { getSweepstakesCampaignMetaMap } from "@/lib/sweepstakesCampaignMeta";
import { BOSS_BONUS_XP, GOLDEN_BOSS_RAFFLE_REWARD } from "@/lib/bossBattle";

function asNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const sessionUser = await getSessionUser();
    const userId = String(sessionUser?.id || "").trim();
    const rewardClaimKey = String(body?.rewardClaimKey || body?.sessionId || "").trim();
    const xpEarned = Math.max(0, Math.floor(asNum(body.xpEarned, 0)));
    const masteryByDomain = body?.masteryByDomain && typeof body.masteryByDomain === "object" ? body.masteryByDomain : {};
    const questionDomains = Array.isArray(body?.questionDomains) ? body.questionDomains : [];
    const correctCount = Math.max(0, Math.floor(asNum(body?.correctCount, 0)));
    const totalQuestions = Math.max(0, Math.floor(asNum(body?.totalQuestions, 0)));
    const outcome = String(body?.outcome || "").trim();
    const encounterType = String(body?.encounterType || "standard").trim();
    const bestStreak = Math.max(0, Math.floor(asNum(body?.bestStreak, 0)));

    if (!userId) return Response.json({ ok: false, error: "Sign in required" }, { status: 401 });
    if (!rewardClaimKey) return Response.json({ ok: false, error: "rewardClaimKey required" }, { status: 400 });
    const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!existing) await ensureUser(userId);

    const claimKey = `game-session:${userId}:${rewardClaimKey}`;
    const priorClaim = await prisma.rewardClaim.findUnique({ where: { claimKey } });
    if (priorClaim) return Response.json({ ok: true, ...(priorClaim.meta as any)?.result, duplicate: true });

    const result: {
      user: Awaited<ReturnType<typeof applyUserXpIncrement>>;
      stage9: { ok: true; awarded: number; walletTokens: number };
      levelRewards?: { previousLevel: number; newLevel: number; lootBoxesAwarded: number };
    } = await prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', userId);
      const retry = await tx.rewardClaim.findUnique({ where: { claimKey } });
      if (retry) return { ...(retry.meta as any)?.result, duplicate: true } as any;
      await tx.$queryRawUnsafe('SELECT "id" FROM "GameSession" WHERE "id" = $1 FOR UPDATE', rewardClaimKey);
      const saved = await tx.gameSession.findFirst({ where: { id: rewardClaimKey, userId }, include: { questions: { orderBy: { orderIndex: "asc" } } } });
      if (!saved || saved.status !== "COMPLETED") throw new Error("Completed owned learning session required");
      const itemUses = await tx.rewardClaim.findMany({ where: { userId, kind: "ITEM_USE" } });
      const facts = settleCombat(saved, itemUses);
      if (!facts.finished) throw new Error("Session is not finished");
      const { correctCount, totalQuestions, outcome, bestStreak } = facts;
      const encounterType = facts.boss ? "boss" : "standard";
      const hintPenalty = Math.min(facts.xpEarned,Math.max(0,Math.floor(Number(body.hintXpSpent) || 0)));
      const xpEarned = facts.xpEarned - hintPenalty + (facts.boss && outcome === "victory" ? BOSS_BONUS_XP : 0);
      const masteryByDomain = {}; // Learning mastery is derived from answer history, not client gauges.
      const questionDomains = saved.questions.filter((q: any) => q.answered).map((q: any) => ({ domainId: q.payloadJson?.domainId, level: q.payloadJson?.level }));
      await tx.rewardClaim.create({ data: { userId, claimKey, kind: "GAME_SESSION", meta: { xpEarned, correctCount, totalQuestions, outcome, encounterType, bestStreak } } });
      if (facts.boss && outcome === "victory") {
        await awardRaffleEntries(tx as any, { userId, source: facts.boss.isGolden ? "GOLDEN_BOSS" : "BOSS_BATTLE", quantity: facts.boss.isGolden ? GOLDEN_BOSS_RAFFLE_REWARD : 1, sourceRefType: "SESSION", sourceRefId: saved.id, auditKey: `boss:${saved.id}` });
        await tx.lootBox.create({ data: { userId, type: facts.boss.isGolden ? "GOLD" : "SILVER", status: "PENDING", source: `BOSS_VICTORY:${saved.id}` } });
        for (const itemRef of facts.boss.isGolden ? ["shield_charge","health_restore","fury_charge"] : ["shield_charge","health_restore"]) {
          await tx.inventoryItem.create({ data: { userId, itemType: "POWERUP", itemRef, quantity: 1 } });
        }
      }
      if (!facts.boss && outcome === "complete" && facts.playerHP > 0 && saved.lane === "TEST_NOW") {
        const candidates = saved.questions.filter((q: any) => q.isGolden && q.answered && q.isCorrect);
        if (candidates.length) {
          const campaign = await getOrCreateActiveGoldenSweepstakes(tx as any);
          const campaignMeta = await getSweepstakesCampaignMetaMap(tx as any);
          if (campaignMeta.get(String(campaign.id))?.allowGoldenQuestion !== false) {
            for (const q of candidates) await awardGoldenQuestion(tx, { userId, sessionId: saved.id, questionId: String(q.questionId || q.id), campaignId: campaign.id });
          }
        }
      }
      const beforeXpUser = await tx.user.findUnique({ where: { id: userId }, select: { xp: true } });
      const previousLevel = levelFromXp(Number(beforeXpUser?.xp || 0));
      const user = await applyUserXpIncrement(tx, userId, xpEarned);
      const newLevel = levelFromXp(Number((user as any)?.xp || 0));

      const domainMap = new Map<string, { mastery: number; questions: number; level: number }>();
      for (const [key, val] of Object.entries(masteryByDomain || {})) {
        const domain = inferDomainFromQuestion({ domain: String(key || "general") }).toUpperCase();
        const current = domainMap.get(domain) || { mastery: 0, questions: 0, level: 1 };
        current.mastery = Math.max(current.mastery, asNum(val, 0));
        domainMap.set(domain, current);
      }
      for (const row of questionDomains) {
        const domain = inferDomainFromQuestion({ domain: String((row as any)?.domainId || "general") }).toUpperCase();
        const current = domainMap.get(domain) || { mastery: 0, questions: 0, level: 1 };
        current.questions += 1;
        current.level = Math.max(current.level, Math.max(1, Math.min(5, Math.floor(asNum((row as any)?.level, 1)))));
        domainMap.set(domain, current);
      }

      for (const [domain, info] of domainMap.entries()) {
        const domainXpIncrement = Math.max(
          1,
          Math.round(info.questions * 0.5 + info.level * 0.5 + (Math.max(0, Math.min(100, info.mastery)) / 100) * 1.5)
        );
        await tx.userDomain.upsert({
          where: { userId_domain: { userId, domain } },
          update: {
            xp: { increment: domainXpIncrement },
            lastPracticedAt: new Date(),
          },
          create: {
            userId,
            domain,
            xp: domainXpIncrement,
            lastPracticedAt: new Date(),
          },
        });
      }

      let awarded = correctCount * 2;
      if (totalQuestions > 0 && correctCount === totalQuestions) awarded += 10;
      if (outcome.toLowerCase() === "victory" || outcome.toLowerCase() === "complete") awarded += 8;
      if (encounterType.toLowerCase() === "boss" && outcome === "victory") awarded += 12;
      if (bestStreak >= 5) awarded += 6;
      awarded = Math.max(0, Math.floor(awarded));

      const wallet = await tx.wallet.upsert({
        where: { userId },
        update: { tokenBalance: { increment: awarded } },
        create: { userId, tokenBalance: awarded },
      });
      try {
        await tx.notification.create({
          data: {
            userId,
            type: "LOOT_BOX_EARNED" as any,
            title: `Session reward: +${awarded} tokens`,
            body: encounterType.toLowerCase() === "boss"
              ? `Boss run complete • ${correctCount}/${totalQuestions} correct • Wallet now ${wallet.tokenBalance}`
              : `Session complete • ${correctCount}/${totalQuestions} correct • Wallet now ${wallet.tokenBalance}`,
          } as any,
        });
      } catch {}

      const result = { user: { id: user.id, xp: user.xp }, outcome, xpAwarded: Math.max(0,Number(user.xp) - Number(beforeXpUser?.xp || 0)), boss: facts.boss, stage9: { ok: true as const, awarded, walletTokens: wallet.tokenBalance }, levelRewards: { previousLevel, newLevel, lootBoxesAwarded: Number(user.levelRewardsCreated || 0) } };
      await tx.rewardClaim.update({ where: { claimKey }, data: { meta: { xpEarned, correctCount, totalQuestions, outcome, encounterType, bestStreak, result } } });
      return result;
    });

    await import("@/lib/stage9Economy").then(({ touchUserActivity }) => touchUserActivity(userId)).catch(() => null);
    return Response.json({ ok: true, ...result });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return Response.json({ ok: true, duplicate: true, stage9: { awarded: 0 } });
    }
    console.error("Game session save failed", err);
    return Response.json({ ok: false, error: err?.message || "Failed to save game session" }, { status: /Completed owned|not finished/.test(String(err?.message)) ? 400 : 500 });
  }
}
