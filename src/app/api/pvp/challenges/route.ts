import { NextResponse } from "next/server";
import { createPvpChallenge, listPvpChallengesForUser, toPublicChallenge } from "@/lib/pvp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = String(url.searchParams.get("userId") || "").trim();
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
    const rows = listPvpChallengesForUser(userId);
    return NextResponse.json({
      ok: true,
      incoming: rows.incoming.map((row) => toPublicChallenge(row, userId)),
      outgoing: rows.outgoing.map((row) => toPublicChallenge(row, userId)),
      completed: rows.completed.map((row) => toPublicChallenge(row, userId)),
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to load PvP challenges", detail: String(err?.message ?? err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const challenge = await createPvpChallenge({
      challengerId: String(body?.challengerId || "").trim(),
      challengerName: body?.challengerName ? String(body.challengerName) : undefined,
      rivalId: String(body?.rivalId || "").trim(),
      rivalName: body?.rivalName ? String(body.rivalName) : undefined,
      questionCount: Number(body?.questionCount || 6) || 6,
    });
    return NextResponse.json({ ok: true, challenge: toPublicChallenge(challenge, challenge.challenger.userId) });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to create PvP challenge", detail: String(err?.message ?? err) }, { status: 500 });
  }
}
