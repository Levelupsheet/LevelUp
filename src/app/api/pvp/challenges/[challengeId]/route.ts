import { NextResponse } from "next/server";
import { acceptPvpChallenge, getPvpChallenge, toPublicChallenge } from "@/lib/pvp";

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


export async function POST(req: Request, context: { params: Promise<{ challengeId: string }> }) {
  try {
    const { challengeId } = await context.params;
    const body = await req.json().catch(() => ({} as any));
    const userId = String(body?.userId || "").trim();
    const action = String(body?.action || "").trim().toLowerCase();
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
    if (action !== "accept") return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    const challenge = await acceptPvpChallenge({ challengeId, userId });
    return NextResponse.json({ ok: true, challenge: toPublicChallenge(challenge, userId) });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to update PvP challenge", detail: String(err?.message ?? err) }, { status: 500 });
  }
}
