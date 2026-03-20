import { prisma } from "@/lib/prisma";
import { ensureUser } from "@/app/api/_lib/ensureUser";
import { computeAccuracy, nextMasteryValue, normalizeQuestionDomain, summarizeWeakestDomains } from "@/lib/learningProfile";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const userId = String(body.userId || "").trim();
    const xpEarned = Number(body.xpEarned || 0);
    const masterySnapshot = body?.mastery && typeof body.mastery === "object" ? body.mastery : {};
    const questions = Array.isArray(body?.questions) ? body.questions : [];
    const tier = Math.max(1, Math.min(3, Number(body?.tier || 1) || 1));

    if (!userId) return Response.json({ ok: false, error: "userId required" }, { status: 400 });
    if (!Number.isFinite(xpEarned) || xpEarned < 0) return Response.json({ ok: false, error: "xpEarned must be a non-negative number" }, { status: 400 });

    const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!existing) await ensureUser(userId);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { xp: { increment: Math.floor(xpEarned) }, lastActiveAt: new Date() },
      select: { id: true, xp: true },
    });

    const client = prisma as any;
    const masteryEntries = Object.entries(masterySnapshot || {}).filter(([, value]) => Number.isFinite(Number(value)));

    if (masteryEntries.length && client.userDomainMastery) {
      for (const [rawDomain, rawMastery] of masteryEntries) {
        const domain = normalizeQuestionDomain(rawDomain);
        const mastery = Math.max(0, Math.min(100, Number(rawMastery || 0)));
        const existingRow = await client.userDomainMastery.findUnique({
          where: { userId_domain: { userId, domain } },
        }).catch(() => null);

        const correctCount = Number(existingRow?.correctCount || 0) + Math.max(0, Math.round(mastery / 25));
        const wrongCount = Number(existingRow?.wrongCount || 0) + Math.max(0, Math.round((100 - mastery) / 40));
        const accuracy = computeAccuracy(correctCount, wrongCount);

        await client.userDomainMastery.upsert({
          where: { userId_domain: { userId, domain } },
          update: {
            mastery,
            currentDifficulty: tier,
            correctCount,
            wrongCount,
            accuracy,
            updatedAt: new Date(),
          },
          create: {
            userId,
            domain,
            mastery,
            currentDifficulty: tier,
            correctCount,
            wrongCount,
            accuracy,
          },
        }).catch(() => null);
      }
    }

    if (questions.length && client.userQuestionHistory) {
      for (const q of questions.slice(0, 50)) {
        const domain = normalizeQuestionDomain(q?.domainId || "GENERAL");
        await client.userQuestionHistory.create({
          data: {
            userId,
            questionId: String(q?.id || crypto.randomUUID()),
            prompt: String(q?.prompt || "Question"),
            domain,
            difficulty: Math.max(1, Math.min(3, Number(q?.difficulty || 1) || 1)),
            correct: true,
          },
        }).catch(() => null);
      }
    }

    if (client.userLearningProfile && masteryEntries.length) {
      const rows = await client.userDomainMastery.findMany({ where: { userId } }).catch(() => []);
      const overallMastery = rows.length ? Number((rows.reduce((sum: number, row: any) => sum + Number(row.mastery || 0), 0) / rows.length).toFixed(1)) : 0;
      const weakestDomains = summarizeWeakestDomains(rows.map((row: any) => ({ domain: row.domain, mastery: Number(row.mastery || 0) })));
      await client.userLearningProfile.upsert({
        where: { userId },
        update: { overallMastery, weakestDomains, updatedAt: new Date() },
        create: { userId, overallMastery, weakestDomains },
      }).catch(() => null);
    }

    return Response.json({ ok: true, user: updated });
  } catch (err: any) {
    return Response.json({ ok: false, error: "Failed to save game session", detail: String(err?.message ?? err) }, { status: 500 });
  }
}
