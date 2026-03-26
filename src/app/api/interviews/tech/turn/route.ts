import { z } from "zod";
import { prisma } from "../../../_lib/prisma";
import { buildInterviewPlan, evaluateInterviewAnswerDetailed, generateInterviewerReply } from "@/lib/interviewIntelligence";

const Body = z.object({
  sessionId: z.string().min(1),
  answer: z.string().min(20),
});

function readPlan(summary?: string | null) {
  if (!summary) return null;
  try {
    const parsed = JSON.parse(summary);
    return Array.isArray(parsed?.plan) ? parsed.plan : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const session = await prisma.interviewSession.findUnique({ where: { id: body.sessionId } });
    if (!session) return Response.json({ error: "Session not found" }, { status: 404 });
    if (session.status !== "IN_PROGRESS") return Response.json({ error: "Session not active" }, { status: 400 });

    const candidateTurns = await prisma.interviewTurn.findMany({ where: { sessionId: session.id, speaker: "CANDIDATE" }, orderBy: { turnIndex: "asc" } });
    const plan = readPlan(session.summary) || await buildInterviewPlan(session.userId, "TECH" as any);
    const turnIndex = candidateTurns.length;
    const focus = plan[turnIndex]?.focus || null;
    const score = evaluateInterviewAnswerDetailed({ kind: "TECH", answer: body.answer, focus, turnIndex });

    await prisma.interviewTurn.create({
      data: {
        sessionId: session.id,
        speaker: "CANDIDATE",
        content: body.answer,
        scoreTotal: score.total,
        breakdownJson: score as any,
        turnIndex,
      },
    });

    const nextQuestion = plan[turnIndex + 1]?.prompt || null;
    const interviewerReply = generateInterviewerReply({ kind: "TECH", focus, score, nextQuestion });
    return Response.json({ ok: true, nextQuestion, interviewerReply, score, focus, done: !nextQuestion });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Bad request" }, { status: 400 });
  }
}
