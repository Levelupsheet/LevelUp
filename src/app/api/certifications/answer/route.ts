import { z } from "zod";
import { prisma } from "../../_lib/prisma";
import { applyUserXpIncrement } from "@/lib/xpCaps";

const Body = z.object({
  userId: z.string().min(1),
  exam: z.enum(["A_PLUS", "SECURITY_PLUS", "AZ_900", "AWS", "AZURE"]),
  prompt: z.string().min(5),
  answer: z.string().min(10),
});

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());

    const user = await prisma.user.upsert({
      where: { id: body.userId },
      update: {},
      create: { id: body.userId, email: `${body.userId}@local.leveluppro`, displayName: body.userId, authProvider: "LOCAL" },
    });

    const len = body.answer.trim().length;
    const xpAwarded = Math.min(40, Math.max(8, Math.round(len / 40)));

    await prisma.certPracticeAnswer.create({
      data: {
        userId: user.id,
        exam: body.exam,
        prompt: body.prompt,
        answer: body.answer,
        xpAwarded,
      },
    });

    await applyUserXpIncrement(prisma, user.id, xpAwarded);

    return Response.json({ ok: true, xpAwarded });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Bad request" }, { status: 400 });
  }
}
