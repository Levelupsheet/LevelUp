import { z } from "zod";
import { prisma } from "../../_lib/prisma";

const POSITION_CHANGE_COST = 300;

const Body = z.object({
  userId: z.string().min(1),
  startingPosition: z.enum(["HELPDESK_SUPPORT", "DESKTOP_TECHNICIAN", "CLOUD_ENGINEER"]),
});

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());

    const existing = await prisma.user.findUnique({
      where: { id: body.userId },
      select: { startingPosition: true },
    });

    // The first player/path selection is free. Only an actual change costs tokens.
    if (!existing?.startingPosition) {
      const user = await prisma.user.upsert({
        where: { id: body.userId },
        update: { startingPosition: body.startingPosition },
        create: {
          id: body.userId,
          email: `${body.userId}@local.leveluppro`,
          displayName: body.userId,
          authProvider: "LOCAL",
          startingPosition: body.startingPosition,
        },
      });
      return Response.json({ ok: true, charged: 0, tokenBalance: null, user: { id: user.id, startingPosition: user.startingPosition } });
    }

    if (existing.startingPosition === body.startingPosition) {
      const wallet = await prisma.wallet.findUnique({ where: { userId: body.userId } });
      return Response.json({ ok: true, charged: 0, tokenBalance: wallet?.tokenBalance ?? 0, user: { id: body.userId, startingPosition: existing.startingPosition } });
    }

    const result = await prisma.$transaction(async (tx) => {
      const charged = await tx.wallet.updateMany({
        where: { userId: body.userId, tokenBalance: { gte: POSITION_CHANGE_COST } },
        data: { tokenBalance: { decrement: POSITION_CHANGE_COST } },
      });
      if (charged.count !== 1) throw new Error("INSUFFICIENT_TOKENS");

      const user = await tx.user.update({
        where: { id: body.userId },
        data: { startingPosition: body.startingPosition },
      });
      const wallet = await tx.wallet.findUnique({ where: { userId: body.userId } });
      return { user, tokenBalance: wallet?.tokenBalance ?? 0 };
    });

    return Response.json({
      ok: true,
      charged: POSITION_CHANGE_COST,
      tokenBalance: result.tokenBalance,
      user: { id: result.user.id, startingPosition: result.user.startingPosition },
    });
  } catch (e: any) {
    if (e?.message === "INSUFFICIENT_TOKENS") {
      return Response.json({ error: "You need 300 tokens to change your player/path." }, { status: 402 });
    }
    return Response.json({ error: e?.message ?? "Bad request" }, { status: 400 });
  }
}
