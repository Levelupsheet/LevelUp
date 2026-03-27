
import { NextResponse } from "next/server";
import { getStage12Profile } from "@/lib/stage12";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = String(searchParams.get("userId") || "").trim();
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
    const profile = getStage12Profile(userId);
    if (!profile) return NextResponse.json({ ok: true, coaching: null, profile: null });
    return NextResponse.json({
      ok: true,
      coaching: profile.coaching,
      profile: {
        targetRole: profile.targetRole,
        skills: profile.skills,
        inferredDomains: profile.inferredDomains,
        certifications: profile.certifications,
        analyzedAt: profile.analyzedAt,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to load AI coach", detail: String(err?.message || err) }, { status: 500 });
  }
}
