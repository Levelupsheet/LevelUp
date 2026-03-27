import { NextResponse } from "next/server";
import { submitPvpChallenge, toPublicChallenge } from "@/lib/pvp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ challengeId: string }> }) {
  try {
    const { challengeId } = await context.params;
    const body = await req.json().catch(() => ({} as any));
    const userId = String(body?.userId || "").trim();
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
    const challenge = await submitPvpChallenge({
      challengeId,
      userId,
      answers: Array.isArray(body?.answers) ? body.answers : [],
      totalTimeMs: Number(body?.totalTimeMs || 0) || 0,
    });
    return NextResponse.json({ ok: true, challenge: toPublicChallenge(challenge, userId) });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to submit PvP challenge", detail: String(err?.message ?? err) }, { status: 500 });
  }
}
