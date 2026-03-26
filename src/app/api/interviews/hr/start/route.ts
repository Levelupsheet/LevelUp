import { z } from "zod";
import { prisma } from "../../../_lib/prisma";
import { buildInterviewPlan } from "@/lib/interviewIntelligence";

const Body = z.object({ userId: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const { userId } = Body.parse(await req.json());
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return Response.json({ error: "User not found" }, { status: 404 });

    const plan = await buildInterviewPlan(userId, "HR" as any);
    const session = await prisma.interviewSession.create({
      data: {
        userId,
        kind: "HR",
        status: "IN_PROGRESS",
        startedAt: new Date(),
        summary: JSON.stringify({ stage4: true, plan }),
      },
    });

    return Response.json({ ok: true, session, nextQuestion: plan[0]?.prompt || null, interviewPlan: plan });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Bad request" }, { status: 400 });
  }
}
