import { prisma } from "@/lib/prisma";
import { ensureUser } from "@/app/api/_lib/ensureUser";
import { inferDomainFromQuestion } from "@/lib/learningProfile";

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

    if (!userId) return Response.json({ ok: false, error: "userId required" }, { status: 400 });
    const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!existing) await ensureUser(userId);

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { xp: { increment: xpEarned }, lastActiveAt: new Date() },
        select: { id: true, xp: true },
      });

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
        const targetXp = Math.max(0, Math.round(info.mastery * 4 + info.questions * 8 + info.level * 6));
        const existingDomain = await tx.userDomain.findUnique({ where: { userId_domain: { userId, domain } } });
        await tx.userDomain.upsert({
          where: { userId_domain: { userId, domain } },
          update: {
            xp: existingDomain ? Math.max(existingDomain.xp, targetXp) : targetXp,
            lastPracticedAt: new Date(),
          },
          create: {
            userId,
            domain,
            xp: targetXp,
            lastPracticedAt: new Date(),
          },
        });
      }

      return user;
    });

    return Response.json({ ok: true, user: updated });
  } catch (err: any) {
    return Response.json({ ok: false, error: "Failed to save game session", detail: String(err?.message ?? err) }, { status: 500 });
  }
}
