import { prisma } from "@/lib/prisma";
import { ensureUser } from "@/app/api/_lib/ensureUser";
import { getSessionUser } from "@/lib/auth/session";
import { inferDomainFromQuestion } from "@/lib/learningProfile";
import { applyUserXpIncrement } from "@/lib/xpCaps";

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
    if (priorClaim) return Response.json({ ok: true, duplicate: true, stage9: { awarded: 0 } });

    const result: {
      user: Awaited<ReturnType<typeof applyUserXpIncrement>>;
      stage9: { ok: true; awarded: number; walletTokens: number };
    } = await prisma.$transaction(async (tx) => {
      await tx.rewardClaim.create({ data: { userId, claimKey, kind: "GAME_SESSION", meta: { xpEarned, correctCount, totalQuestions, outcome, encounterType, bestStreak } } });
      const user = await applyUserXpIncrement(tx, userId, xpEarned);

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
        current.level = Math.max(current.level, Math.max(1, Math.min(3, Math.floor(asNum((row as any)?.level, 1)))));
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
      if (encounterType.toLowerCase() === "boss") awarded += 12;
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

      return { user, stage9: { ok: true as const, awarded, walletTokens: wallet.tokenBalance } };
    });

    await import("@/lib/stage9Economy").then(({ touchUserActivity }) => touchUserActivity(userId)).catch(() => null);
    return Response.json({ ok: true, user: result.user, stage9: result.stage9 });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return Response.json({ ok: true, duplicate: true, stage9: { awarded: 0 } });
    }
    console.error("Game session save failed", err);
    return Response.json({ ok: false, error: "Failed to save game session" }, { status: 500 });
  }
}
