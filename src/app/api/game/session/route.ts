import { prisma } from "@/lib/prisma";
import { ensureUser } from "@/app/api/_lib/ensureUser";
import { computeAccuracy, domainIdToEnum, inferDomainFromQuestion, nextMasteryValue, summarizeWeakestDomains, type LearningAnswerEvent } from "@/lib/learningProfile";
import { awardRaffleEntries } from "@/lib/raffle";
import { BOSS_BONUS_XP, BOSS_SPAWN_PROBABILITY, GOLDEN_BOSS_PROBABILITY, applyBossAbilitiesToQuestions, bossVisualMeta, buildBossProfile, mapBossQuestion, selectBossQuestions, shouldSpawnBossBattle, shouldSpawnGoldenBoss } from "@/lib/bossBattle";
import { evaluateQuizAntiCheat } from "@/lib/antiCheat";

type GameSessionBody = {
  userId?: string;
  lane?: "TEST_NOW" | "TRAINING" | "CERTIFICATIONS";
  title?: string;
  startingPosition?: string | null;
  certExam?: string | null;
  correctCount?: number;
  totalQuestions?: number;
  xpEarned?: number;
  outcome?: string | null;
  answerEvents?: LearningAnswerEvent[];
  domainMastery?: Record<string, number>;
  goldenQuestionSeen?: boolean;
  goldenQuestionCorrect?: boolean;
  captchaToken?: string | null;
  deviceFingerprint?: string | null;
  sessionId?: string | null;
  hintXpSpent?: number;
  hintsUsedCount?: number;
  hintsUsed?: Array<{ questionId?: string; hintType?: string; cost?: number; usedAt?: string }>;
  netXpDelta?: number;
};

function buildPlacementWhere(body: GameSessionBody) {
  const where: any = { lane: body.lane, isActive: true };
  if (body.lane === "TRAINING" && body.startingPosition) where.startingPosition = body.startingPosition as any;
  if (body.lane === "CERTIFICATIONS" && body.certExam) where.certExam = body.certExam as any;
  return where;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as GameSessionBody;
    const userId = String(body.userId || "").trim();
    const xpEarned = Math.floor(Number(body.xpEarned || 0));
    const hintXpSpent = Math.max(0, Math.floor(Number(body.hintXpSpent || 0)));
    const hintsUsedCount = Math.max(0, Math.floor(Number(body.hintsUsedCount || 0)));
    const netXpDelta = Math.floor(Number(body.netXpDelta ?? (xpEarned - hintXpSpent)));
    const answerEvents = Array.isArray(body.answerEvents) ? body.answerEvents : [];

    if (!userId) {
      return Response.json({ ok: false, error: "userId required" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!existing) await ensureUser(userId);

    const result = await prisma.$transaction(async (tx) => {
      const antiCheat = await evaluateQuizAntiCheat({
        tx: tx as any,
        req,
        userId,
        lane: body.lane || null,
        answerEvents,
        captchaToken: body.captchaToken || null,
        body,
      });

      if (!antiCheat.ok) {
        throw new Error(`ANTI_CHEAT_BLOCKED:${JSON.stringify({ reasons: antiCheat.reasons, cooldownUntil: antiCheat.cooldownUntil })}`);
      }

      const currentUser = await tx.user.findUnique({ where: { id: userId }, select: { xp: true } });
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { xp: Math.max(0, Number(currentUser?.xp || 0) + netXpDelta), lastActiveAt: new Date() },
        select: { id: true, xp: true },
      });

      const leaderboardPenalty = hintsUsedCount > 0 ? Math.max(hintXpSpent, hintsUsedCount * 3) : 0;
      await tx.gameSession.create({
        data: {
          userId,
          lane: body.lane || null,
          title: body.title || null,
          startingPosition: body.startingPosition ? body.startingPosition as any : null,
          certExam: body.certExam ? body.certExam as any : null,
          correctCount: Math.max(0, Math.floor(Number(body.correctCount || 0))),
          totalQuestions: Math.max(0, Math.floor(Number(body.totalQuestions || answerEvents.length || 0))),
          xpEarned,
          hintXpSpent,
          hintsUsedCount,
          hintsUsedJson: Array.isArray(body.hintsUsed) ? body.hintsUsed as any : [],
          leaderboardPenalty,
          outcome: body.outcome || null,
        },
      });

      const learningProfile = await tx.userLearningProfile.upsert({
        where: { userId },
        update: {},
        create: { userId },
      });

      for (const rawEvent of answerEvents) {
        const domain = domainIdToEnum(rawEvent.domainId || "general");
        const difficulty = Math.max(1, Math.min(5, Math.round(Number(rawEvent.difficulty || 1))));
        const previous = await tx.userDomainMastery.findUnique({
          where: { userId_domainMastery: { userId, domain } },
          select: { mastery: true, correctCount: true, wrongCount: true },
        });

        const correctCount = (previous?.correctCount || 0) + (rawEvent.correct ? 1 : 0);
        const wrongCount = (previous?.wrongCount || 0) + (rawEvent.correct ? 0 : 1);
        const mastery = nextMasteryValue(previous?.mastery ?? 50, rawEvent.correct, difficulty);
        const accuracy = computeAccuracy(correctCount, wrongCount);
        const answeredAt = rawEvent.answeredAt ? new Date(rawEvent.answeredAt) : new Date();

        await tx.userDomainMastery.upsert({
          where: { userId_domainMastery: { userId, domain } },
          update: {
            mastery,
            correctCount,
            wrongCount,
            totalAnswers: correctCount + wrongCount,
            accuracy,
            currentDifficulty: difficulty,
            lastAnsweredAt: answeredAt,
          },
          create: {
            userId,
            domain,
            mastery,
            correctCount,
            wrongCount,
            totalAnswers: correctCount + wrongCount,
            accuracy,
            currentDifficulty: difficulty,
            lastAnsweredAt: answeredAt,
          },
        });

        const previousDifficulty = await tx.userDifficultyAccuracy.findUnique({
          where: { userId_domain_difficulty: { userId, domain, difficulty } },
          select: { correctCount: true, wrongCount: true },
        });
        const difficultyCorrect = (previousDifficulty?.correctCount || 0) + (rawEvent.correct ? 1 : 0);
        const difficultyWrong = (previousDifficulty?.wrongCount || 0) + (rawEvent.correct ? 0 : 1);

        await tx.userDifficultyAccuracy.upsert({
          where: { userId_domain_difficulty: { userId, domain, difficulty } },
          update: {
            correctCount: difficultyCorrect,
            wrongCount: difficultyWrong,
            totalAnswers: difficultyCorrect + difficultyWrong,
            accuracy: computeAccuracy(difficultyCorrect, difficultyWrong),
            lastAnsweredAt: answeredAt,
          },
          create: {
            userId,
            domain,
            difficulty,
            correctCount: difficultyCorrect,
            wrongCount: difficultyWrong,
            totalAnswers: difficultyCorrect + difficultyWrong,
            accuracy: computeAccuracy(difficultyCorrect, difficultyWrong),
            lastAnsweredAt: answeredAt,
          },
        });

        await tx.userQuestionHistory.create({
          data: {
            userId,
            questionId: String(rawEvent.questionId || `session-${Date.now()}`),
            prompt: String(rawEvent.prompt || "Untitled question"),
            type: rawEvent.type ? String(rawEvent.type).toUpperCase() as any : null,
            domain,
            difficulty,
            correct: Boolean(rawEvent.correct),
            lane: body.lane || null,
            isGolden: Boolean((rawEvent as any).golden),
          },
        });
      }

      const goldenQuestionSeen = Boolean(body.goldenQuestionSeen || answerEvents.some((event: any) => event?.golden));
      const goldenQuestionCorrect = Boolean(body.goldenQuestionCorrect || answerEvents.some((event: any) => event?.golden && event?.correct));
      if (goldenQuestionSeen) {
        await tx.userLearningProfile.update({
          where: { userId },
          data: { sessionsSinceLastGolden: 0, lastGoldenServedAt: new Date() },
        });
      } else {
        await tx.userLearningProfile.update({
          where: { userId },
          data: { sessionsSinceLastGolden: (learningProfile.sessionsSinceLastGolden || 0) + 1 },
        });
      }

      let raffleEntriesAwarded = 0;
      if (goldenQuestionCorrect) {
        const awarded = await awardRaffleEntries(tx as any, {
          userId,
          source: "GOLDEN_QUESTION",
          quantity: 1,
          meta: { lane: body.lane || null, title: body.title || null } as any,
          sourceRefType: "SESSION",
          sourceRefId: String(body.sessionId || body.title || "session"),
          auditKey: `golden:${userId}:${String(body.sessionId || body.title || "session")}`,
        });
        raffleEntriesAwarded = awarded.awarded;
      }

      const masteryRows = await tx.userDomainMastery.findMany({ where: { userId }, orderBy: { mastery: "asc" } });
      const overallMastery = masteryRows.length
        ? Number((masteryRows.reduce((sum, row) => sum + Number(row.mastery || 0), 0) / masteryRows.length).toFixed(1))
        : 50;
      const weakestDomains = summarizeWeakestDomains(masteryRows.map((row) => ({ domain: row.domain, mastery: Number(row.mastery || 0) })));

      const updatedProfile = await tx.userLearningProfile.upsert({
        where: { userId },
        update: { overallMastery, weakestDomains },
        create: { userId, overallMastery, weakestDomains },
      });

      let bossEncounter: any = null;
      const spawnBoss = shouldSpawnBossBattle();
      const spawnGoldenBoss = shouldSpawnGoldenBoss();

      if ((spawnBoss || spawnGoldenBoss) && body.lane) {
        const placement = await tx.questionSetPlacement.findFirst({
          where: buildPlacementWhere(body),
          orderBy: { createdAt: "desc" },
          include: { set: { include: { questions: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } } } },
        });

        const sourceQuestions = (placement?.set?.questions || []).filter((q) => !answerEvents.some((event) => String(event.questionId || "") === String(q.id)));
        const weakestDomainId = weakestDomains?.[0] ? String(weakestDomains[0]).toLowerCase() : "general";
        const chosen = selectBossQuestions(sourceQuestions.length ? sourceQuestions : placement?.set?.questions || [], 3, weakestDomainId);

        if (chosen.length) {
          const isGoldenBoss = spawnGoldenBoss;
          const visual = bossVisualMeta(isGoldenBoss);
          const mappedQuestions = chosen.map((q) => mapBossQuestion(q, inferDomainFromQuestion({ tags: q.tags as any, prompt: q.prompt, data: q.data as any, setDomain: placement?.set?.domain as any })));
          const bossProfile = buildBossProfile({
            weakestDomain: weakestDomainId,
            userXp: updatedUser.xp,
            sessionCorrectCount: Number(body.correctCount || 0),
            sessionTotalQuestions: Number(body.totalQuestions || answerEvents.length || mappedQuestions.length),
            selectedQuestions: mappedQuestions,
            isGolden: isGoldenBoss,
          });
          const bossQuestions = applyBossAbilitiesToQuestions(mappedQuestions, bossProfile);
          const created = await tx.bossEncounter.create({
            data: {
              userId,
              lane: body.lane as any,
              title: body.title || placement?.set?.name || "Boss Battle",
              bossName: visual.bossName,
              isGolden: isGoldenBoss,
              spawnChance: BOSS_SPAWN_PROBABILITY,
              goldenChance: GOLDEN_BOSS_PROBABILITY,
              totalQuestions: bossQuestions.length,
              bossDomain: domainIdToEnum(bossProfile.targetDomain) as any,
              difficultyScale: bossProfile.difficultyScale,
              playerLevelSnapshot: bossProfile.playerLevel,
              sessionAccuracySnapshot: bossProfile.sessionAccuracy,
              playerStatsJson: {
                xp: updatedUser.xp,
                weakestDomains,
                overallMastery,
              } as any,
              bossStatsJson: bossProfile as any,
              abilitiesJson: bossProfile.abilities as any,
              questionsJson: bossQuestions as any,
            },
          });

          bossEncounter = {
            id: created.id,
            isGolden: isGoldenBoss,
            spawnChance: BOSS_SPAWN_PROBABILITY,
            goldenChance: GOLDEN_BOSS_PROBABILITY,
            bossName: visual.bossName,
            bonusXp: BOSS_BONUS_XP,
            raffleEntriesReward: isGoldenBoss ? 3 : 0,
            bossProfile,
            questions: bossQuestions.map((q) => ({ ...q, golden: isGoldenBoss })),
          };
        }
      }

      return {
        user: updatedUser,
        raffleEntriesAwarded,
        bossEncounter,
        antiCheat,
        learningProfile: {
          overallMastery,
          weakestDomains,
          sessionsSinceLastGolden: updatedProfile.sessionsSinceLastGolden,
          masteryByDomain: masteryRows.map((row) => ({
            domain: row.domain,
            mastery: row.mastery,
            accuracy: row.accuracy,
            currentDifficulty: row.currentDifficulty,
            correctCount: row.correctCount,
            wrongCount: row.wrongCount,
          })),
        },
      };
    });

    return Response.json({ ok: true, ...result });
  } catch (err: any) {
    const message = String(err?.message ?? err);
    if (message.startsWith("ANTI_CHEAT_BLOCKED:")) {
      const detail = message.slice("ANTI_CHEAT_BLOCKED:".length);
      return Response.json({ ok: false, error: "Quiz session blocked for review", antiCheat: JSON.parse(detail) }, { status: 429 });
    }
    return Response.json({ ok: false, error: "Failed to save game session", detail: message }, { status: 500 });
  }
}
