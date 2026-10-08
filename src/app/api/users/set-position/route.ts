import { z } from "zod";
import { prisma } from "../../_lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/adminAuth";

const POSITION_CHANGE_COST = 200;

const Body = z.object({
  userId: z.string().min(1),
  startingPosition: z.enum(["HELPDESK_SUPPORT", "DESKTOP_TECHNICIAN", "CLOUD_ENGINEER"]),
});

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());

    // Character-change pricing is enforced server-side. Admins bypass the
    // token charge only for their own authenticated account.
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) return Response.json({ error: "Sign in required" }, { status: 401 });
    if (sessionUser.id !== body.userId) return Response.json({ error: "Cannot change another user's character" }, { status: 403 });
    const isAdminCharacterChange =
      Boolean(sessionUser?.email) &&
      isAdminEmail(sessionUser?.email) &&
      String(sessionUser?.id || "") === body.userId;

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

    if (isAdminCharacterChange) {
      const user = await prisma.user.update({
        where: { id: body.userId },
        data: { startingPosition: body.startingPosition },
      });
      const wallet = await prisma.wallet.findUnique({ where: { userId: body.userId } });
      return Response.json({
        ok: true,
        charged: 0,
        adminBypass: true,
        tokenBalance: wallet?.tokenBalance ?? 0,
        user: { id: user.id, startingPosition: user.startingPosition },
      });
    }

    const result: { user: { id: string; startingPosition: string | null }; tokenBalance: number } =
      await prisma.$transaction(async (tx): Promise<{ user: { id: string; startingPosition: string | null }; tokenBalance: number }> => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', body.userId);
      const current = await tx.user.findUnique({ where: { id: body.userId } });
      if (current?.startingPosition === body.startingPosition) {
        const wallet = await tx.wallet.findUnique({where:{userId:body.userId}});
        return {user:current,tokenBalance:wallet?.tokenBalance || 0};
      }
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
      return Response.json({ error: "You need 200 tokens to change your player/path." }, { status: 402 });
    }
    return Response.json({ error: e?.message ?? "Bad request" }, { status: 400 });
  }
}
