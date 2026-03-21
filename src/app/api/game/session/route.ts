import { prisma } from "@/lib/prisma";
import { ensureUser } from "@/app/api/_lib/ensureUser";
import { inferDomainFromQuestion } from "@/lib/learningProfile";


async function ensureUserDomainStatsTable(tx: any = prisma) {
  await tx.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserDomainStats" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "domain" TEXT NOT NULL,
      "correctCount" INTEGER NOT NULL DEFAULT 0,
      "wrongCount" INTEGER NOT NULL DEFAULT 0,
      "currentDifficulty" INTEGER NOT NULL DEFAULT 1,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE ("userId", "domain")
    )
  `);
}

function asNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const userId = String(body.userId || "").trim();
    const xpEarned = Math.max(0, Math.floor(asNum(body.xpEarned, 0)));
    const masteryByDomain = body?.masteryByDomain && typeof body.masteryByDomain === "object" ? body.masteryByDomain : {};
    const questionDomains = Array.isArray(body?.questionDomains) ? body.questionDomains : [];
    const domainStatsByDomain = body?.domainStatsByDomain && typeof body?.domainStatsByDomain === "object" ? body.domainStatsByDomain : {};

    if (!userId) return Response.json({ ok: false, error: "userId required" }, { status: 400 });
    const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!existing) await ensureUser(userId);

    const updated = await prisma.$transaction(async (tx: any) => {
      await ensureUserDomainStatsTable(tx as any);
      const user = await tx.user.update({
        where: { id: userId },
        data: { xp: { increment: xpEarned }, lastActiveAt: new Date() },
        select: { id: true, xp: true },
      });

      const domainMap = new Map<string, { mastery: number; questions: number; level: number; correctCount: number; wrongCount: number }>();
      for (const [key, val] of Object.entries(masteryByDomain || {})) {
        const domain = inferDomainFromQuestion({ domain: String(key || "general") }).toUpperCase();
        const current = domainMap.get(domain) || { mastery: 0, questions: 0, level: 1, correctCount: 0, wrongCount: 0 };
        current.mastery = Math.max(current.mastery, asNum(val, 0));
        domainMap.set(domain, current);
      }
      for (const row of questionDomains) {
        const domain = inferDomainFromQuestion({ domain: String((row as any)?.domainId || "general") }).toUpperCase();
        const current = domainMap.get(domain) || { mastery: 0, questions: 0, level: 1, correctCount: 0, wrongCount: 0 };
        current.questions += 1;
        current.level = Math.max(current.level, Math.max(1, Math.min(3, Math.floor(asNum((row as any)?.level, 1)))));
        domainMap.set(domain, current);
      }
      for (const [key, val] of Object.entries(domainStatsByDomain || {})) {
        const domain = inferDomainFromQuestion({ domain: String(key || "general") }).toUpperCase();
        const current = domainMap.get(domain) || { mastery: 0, questions: 0, level: 1, correctCount: 0, wrongCount: 0 };
        current.correctCount += Math.max(0, Math.floor(asNum((val as any)?.correctCount, 0)));
        current.wrongCount += Math.max(0, Math.floor(asNum((val as any)?.wrongCount, 0)));
        current.level = Math.max(current.level, Math.max(1, Math.min(3, Math.floor(asNum((val as any)?.currentDifficulty, 1)))));
        domainMap.set(domain, current);
      }

      for (const [domain, info] of domainMap.entries()) {
        const domainXpIncrement = Math.max(
          1,
          Math.round(info.correctCount * (2 + info.level) + info.wrongCount * 1 + info.questions * 0.5 + (Math.max(0, Math.min(100, info.mastery)) / 100) * 2)
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
        await tx.$executeRawUnsafe(`
          INSERT INTO "UserDomainStats" ("id","userId","domain","correctCount","wrongCount","currentDifficulty","createdAt","updatedAt")
          VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
          ON CONFLICT ("userId","domain") DO UPDATE SET
            "correctCount" = "UserDomainStats"."correctCount" + EXCLUDED."correctCount",
            "wrongCount" = "UserDomainStats"."wrongCount" + EXCLUDED."wrongCount",
            "currentDifficulty" = GREATEST("UserDomainStats"."currentDifficulty", EXCLUDED."currentDifficulty"),
            "updatedAt" = CURRENT_TIMESTAMP
        `, `uds_${Date.now()}_${Math.random().toString(36).slice(2,8)}`, userId, domain, info.correctCount, info.wrongCount, info.level);
      }

      return user;
    });

    return Response.json({ ok: true, user: updated });
  } catch (err: any) {
    return Response.json({ ok: false, error: "Failed to save game session", detail: String(err?.message ?? err) }, { status: 500 });
  }
}
