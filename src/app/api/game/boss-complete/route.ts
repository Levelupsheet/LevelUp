import { prisma } from "@/lib/prisma";
import { ensureUser } from "@/app/api/_lib/ensureUser";
import { BOSS_BONUS_XP, GOLDEN_BOSS_RAFFLE_REWARD } from "@/lib/bossBattle";
import { awardRaffleEntries } from "@/lib/raffle";
import type { LearningAnswerEvent } from "@/lib/learningProfile";

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
    const userId = String(body.userId || "").trim();
    if (!encounterId || !userId) {
      return Response.json({ ok: false, error: "encounterId and userId required" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!existing) await ensureUser(userId);

    const result = await prisma.$transaction(async (tx) => {
      const encounter = await tx.bossEncounter.findUnique({ where: { id: encounterId } });
      if (!encounter || encounter.userId !== userId) throw new Error("Boss encounter not found");
      if (encounter.outcome !== "PENDING") return { alreadyProcessed: true, encounter, bonusXpAwarded: 0, raffleEntriesAwarded: 0 };

      const win = body.outcome === "victory";
      const xpFromQuestions = Math.max(0, Math.floor(Number(body.xpEarned || 0)));
      const hintXpSpent = Math.max(0, Math.floor(Number(body.hintXpSpent || 0)));
      const hintsUsedCount = Math.max(0, Math.floor(Number(body.hintsUsedCount || 0)));
      const bonusXpAwarded = win ? BOSS_BONUS_XP : 0;
      const totalXp = xpFromQuestions + bonusXpAwarded - hintXpSpent;

      let raffleEntriesAwarded = 0;
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

      return { user, encounter: updatedEncounter, bonusXpAwarded, raffleEntriesAwarded };
    });

    return Response.json(Object.assign({ ok: true }, result as any));
  } catch (err: any) {
    return Response.json({ ok: false, error: "Failed to complete boss battle", detail: String(err?.message ?? err) }, { status: 500 });
  }
}
