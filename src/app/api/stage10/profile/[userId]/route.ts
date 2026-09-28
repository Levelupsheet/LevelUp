import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { levelFromXp, levelTitleFromLevel } from "@/lib/progression";

export async function GET(
  _req: Request,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await context.params;

    const id = decodeURIComponent(String(userId || "")).trim();

    if (!id) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const [user, domains, badges, sessions, skills, exposures, interviews] = await Promise.all([
      prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          displayName: true,
          xp: true,
          createdAt: true,
        },
      }),
      prisma.userDomain.findMany({
        where: { userId: id },
        orderBy: [{ xp: "desc" }],
      }),
      prisma.badge.findMany({
        where: { userId: id },
        orderBy: [{ issuedAt: "desc" }],
        take: 10,
      }),
      prisma.gameSession.findMany({
        where: { userId: id },
        select: { status: true, createdAt: true, completedAt: true, stateJson: true, questions: { select: { answered: true, isCorrect: true } } },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      prisma.userSkill.findMany({ where: { userId: id }, orderBy: [{ mastery: "desc" }] }),
      prisma.questionExposure.findMany({ where: { userId: id }, orderBy: { seenAt: "desc" }, take: 2000 }),
      prisma.interviewSession.findMany({ where: { userId: id }, select: { status: true, pass: true, scoreAvg: true, startedAt: true, finishedAt: true } }),
    ]);

    if (!user) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const level = levelFromXp(user.xp || 0);
    const completedSessions = sessions.filter((s) => s.status === "COMPLETED");
    const answered = sessions.flatMap((s) => s.questions).filter((q) => q.answered);
    const correct = answered.filter((q) => q.isCorrect === true).length;
    const accuracy = answered.length ? (correct / answered.length) * 100 : 0;
    const totalSessionMs = completedSessions.reduce((sum, s) => {
      if (!s.completedAt) return sum;
      return sum + Math.max(0, s.completedAt.getTime() - s.createdAt.getTime());
    }, 0);
    const avgResponseValues = skills.map((s) => Number(s.avgResponseMs || 0)).filter((n) => n > 0);
    const avgResponseMs = avgResponseValues.length ? avgResponseValues.reduce((a,b) => a + b, 0) / avgResponseValues.length : 0;
    const totalAttempts = skills.reduce((sum, s) => sum + Number(s.attempts || 0), 0);
    const totalCorrect = skills.reduce((sum, s) => sum + Number(s.correct || 0), 0);
    const overallMastery = skills.length ? skills.reduce((sum, s) => sum + Number(s.mastery || 0), 0) / skills.length : 0;
    const strongestSkill = skills[0] || null;
    const weakestSkill = skills.length ? [...skills].sort((a,b) => Number(a.mastery) - Number(b.mastery))[0] : null;
    const activeDays = new Set(exposures.map((e) => e.seenAt.toISOString().slice(0,10))).size;
    const interviewCompleted = interviews.filter((i) => i.finishedAt);
    const interviewWins = interviewCompleted.filter((i) => i.pass === true).length;
    const interviewAvg = interviewCompleted.length ? interviewCompleted.reduce((sum,i) => sum + Number(i.scoreAvg || 0), 0) / interviewCompleted.length : 0;

    return NextResponse.json({
      user: {
        id: user.id,
        displayName: user.displayName || user.id,
        xp: user.xp || 0,
        level,
        rank: levelTitleFromLevel(level),
        createdAt: user.createdAt,
      },
      mastery: domains.map((d) => ({
        domain: d.domain,
        xp: d.xp,
      })),
      achievements: badges.map((b) => ({
        code: b.code,
        label: b.label,
        issuedAt: b.issuedAt,
      })),
      performance: {
        completedSessions: completedSessions.length,
        totalQuestionsAnswered: answered.length || totalAttempts,
        correctAnswers: answered.length ? correct : totalCorrect,
        accuracy: Number(accuracy.toFixed(1)),
        overallMastery: Number(overallMastery.toFixed(1)),
        avgResponseMs: Math.round(avgResponseMs),
        activeDays,
        estimatedTrainingMinutes: Math.round(totalSessionMs / 60000),
        memberSince: user.createdAt,
        strongestDomain: strongestSkill ? { domain: strongestSkill.domain, mastery: Number(strongestSkill.mastery.toFixed(1)) } : null,
        weakestDomain: weakestSkill ? { domain: weakestSkill.domain, mastery: Number(weakestSkill.mastery.toFixed(1)) } : null,
        interviewSessions: interviewCompleted.length,
        interviewWins,
        interviewAverageScore: Number(interviewAvg.toFixed(1)),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Failed to load public profile",
        detail: String(err?.message ?? err),
      },
      { status: 500 }
    );
  }
}