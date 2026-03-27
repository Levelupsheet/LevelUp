import { NextResponse } from "next/server";
import { getPvpChallenge, toPublicChallenge } from "@/lib/pvp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, context: { params: Promise<{ challengeId: string }> }) {
  try {
    const { challengeId } = await context.params;
    const url = new URL(req.url);
    const userId = String(url.searchParams.get("userId") || "").trim();
    const challenge = getPvpChallenge(challengeId);
    if (!challenge) return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    if (userId && ![challenge.challenger.userId, challenge.rival.userId].includes(userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ ok: true, challenge: toPublicChallenge(challenge, userId) });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to load PvP challenge", detail: String(err?.message ?? err) }, { status: 500 });
  }
}
