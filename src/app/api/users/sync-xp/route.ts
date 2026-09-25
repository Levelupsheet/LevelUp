import { prisma } from "../../_lib/prisma";
import { ensureUser } from "../../_lib/ensureUser";
import { syncUserXpUpward } from "@/lib/xpCaps";
import { getSessionUser } from "@/lib/auth/session";

// Sync local/demo XP to the server (never decreases).
// This keeps the leaderboard consistent with what the dashboard shows.

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const sessionUser = await getSessionUser();
    const userId = String(sessionUser?.id || "").trim();
    const xp = Number(body.xp);

    if (!userId) return Response.json({ ok: false, error: "Sign in required" }, { status: 401 });
    if (!Number.isFinite(xp) || xp < 0)
      return Response.json({ ok: false, error: "xp must be a non-negative number" }, { status: 400 });

    // Ensure user exists (local/demo flows)
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) await ensureUser(userId);

    const current = await prisma.user.findUnique({ where: { id: userId }, select: { xp: true } });
    const currentXp = current?.xp ?? 0;
    const updated = await syncUserXpUpward(prisma, userId, xp);
    return Response.json({ ok: true, xp: (updated as any)?.xp ?? currentXp });
  } catch (err: any) {
    console.error("XP sync failed", err);
    return Response.json({ ok: false, error: "Failed to sync XP" }, { status: 500 });
  }
}
