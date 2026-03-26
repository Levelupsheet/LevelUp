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

    const perf = summarizeInterviewPerformance({ kind: "HR", turns });
    const result = interviewPassFail({ hrAvg: perf.avg });
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
      const delay = Math.floor(15 + Math.random() * 16);
      const scheduledAt = new Date(Date.now() + delay * 60 * 1000);
      await prisma.notification.create({ data: { userId: session.userId, type: "TECH_INTERVIEW_READY", title: "Tech interview is ready", body: `You passed HR. Tech interview will be ready in ~${delay} minutes.`, scheduledAt } }).catch(() => null);
    } else {
      await prisma.notification.create({ data: { userId: session.userId, type: "HR_INVITE", title: "HR screen needs improvement", body: "Practice a bit more and try again. Focus on STAR + clear structure." } }).catch(() => null);
    }

    return Response.json({ ok: true, pass: result.pass, summary: finalSummary, scoreAvg: perf.avg, performance: perf });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Bad request" }, { status: 400 });
  }
}
