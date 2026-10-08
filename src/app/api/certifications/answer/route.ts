import { z } from "zod";
import { prisma } from "../../_lib/prisma";
import { applyUserXpIncrement } from "@/lib/xpCaps";
import { getSessionUser } from "@/lib/auth/session";

const Body = z.object({
  userId: z.string().min(1),
  exam: z.enum(["A_PLUS", "SECURITY_PLUS", "AZ_900", "AWS", "AZURE"]),
  prompt: z.string().min(5),
  answer: z.string().min(10),
});

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) return Response.json({error:"Sign in required"},{status:401});
    if (sessionUser.id !== body.userId) return Response.json({error:"Cannot write another user's answers"},{status:403});

    const user = await prisma.user.upsert({
      where: { id: body.userId },
      update: {},
      create: { id: body.userId, email: `${body.userId}@local.leveluppro`, displayName: body.userId, authProvider: "LOCAL" },
    });

    const len = body.answer.trim().length;
    const xpAwarded = 0; // Legacy self-authored free-text answers are not verified gameplay.

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
