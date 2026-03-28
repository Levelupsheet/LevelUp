import { NextResponse } from "next/server";
import { acceptPvpChallenge, toPublicChallenge } from "@/lib/pvp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ challengeId: string }> }) {
  try {
    const { challengeId } = await context.params;
    const body = await req.json().catch(() => ({} as any));
    const userId = String(body?.userId || "").trim();
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
    const challenge = await acceptPvpChallenge({ challengeId, userId });
    return NextResponse.json({ ok: true, challenge: toPublicChallenge(challenge, userId) });
  } catch (err: any) {
    const detail = String(err?.message ?? err);
    return NextResponse.json({ error: "Failed to accept PvP challenge", detail }, { status: detail.includes("expired after 48 hours") ? 410 : 500 });
  }
}
