import { prisma } from "../../_lib/prisma";
import { ensureUser } from "../../_lib/ensureUser";

// Sync local/demo XP to the server (never decreases).
// This keeps the leaderboard consistent with what the dashboard shows.

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const userId = String(body.userId || "").trim();
    const xp = Number(body.xp);

    if (!userId) return Response.json({ ok: false, error: "userId required" }, { status: 400 });
    if (!Number.isFinite(xp) || xp < 0)
      return Response.json({ ok: false, error: "xp must be a non-negative number" }, { status: 400 });

    // Ensure user exists (local/demo flows)
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) await ensureUser(userId);

    // Read current XP and only ever increase.
    const current = await prisma.user.findUnique({ where: { id: userId }, select: { xp: true } });
    const currentXp = current?.xp ?? 0;
    const nextXp = Math.max(currentXp, xp);

    if (nextXp !== currentXp) {
      const updated = await prisma.user.update({ where: { id: userId }, data: { xp: nextXp }, select: { xp: true } });
      return Response.json({ ok: true, xp: updated.xp });
    }

    return Response.json({ ok: true, xp: currentXp });
  } catch (err: any) {
    return Response.json(
      { ok: false, error: "Failed to sync XP", detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
