import { z } from "zod";
import { prisma } from "../../../_lib/prisma";
import { interviewPassFail } from "../../../_lib/scoring";
import { summarizeInterviewPerformance } from "@/lib/interviewIntelligence";

const Body = z.object({ sessionId: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const { sessionId } = Body.parse(await req.json());
    const session = await prisma.interviewSession.findUnique({ where: { id: sessionId } });
    if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

    const turns = await prisma.interviewTurn.findMany({
      where: { sessionId, speaker: "CANDIDATE" },
      orderBy: { turnIndex: "asc" },
    });

    const perf = summarizeInterviewPerformance({ kind: "TECH", turns });
    const result = interviewPassFail({ techAvg: perf.avg });
    const finalSummary = `${perf.summary} ${result.summary}`;

    await prisma.interviewSession.update({
      where: { id: sessionId },
      data: {
        status: "FINISHED",
        finishedAt: new Date(),
        pass: result.pass,
        scoreAvg: perf.avg,
        summary: JSON.stringify({ finalSummary, performance: perf }),
      },
    });

    if (result.pass) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      await prisma.badge.create({ data: { userId: session.userId, code: "VERIFIED_IT_SUPPORT_L1", label: "Verified IT Support (90 days)", expiresAt } }).catch(() => null);
      await prisma.mockOffer.create({ data: { userId: session.userId, companyName: "BlueHarbor MSP", roleLabel: "IT Support Specialist", title: "Mock Job Offer — IT Support Specialist", salaryText: "$55,000–$70,000 (mock range)" } }).catch(() => null);
      await prisma.notification.create({ data: { userId: session.userId, type: "HR_INVITE", title: "Mock offer earned 🎉", body: "You passed the tech interview. Your 90-day verified badge is now on your profile." } }).catch(() => null);
    } else {
      await prisma.notification.create({ data: { userId: session.userId, type: "HR_INVITE", title: "Tech interview needs improvement", body: "Review the feedback, practice weak domains, then retry." } }).catch(() => null);
    }

    return Response.json({ ok: true, pass: result.pass, summary: finalSummary, scoreAvg: perf.avg, performance: perf });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Bad request" }, { status: 400 });
  }
}
