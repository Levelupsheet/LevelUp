import { NextResponse } from "next/server";
import { buildPersonalizedLearningPath } from "@/lib/learningPath";
import { getRequestUserId } from "@/app/api/_lib/authUser";

export async function GET(req: Request) {
  try {
    const userId = String((await getRequestUserId(req)) || "").trim();
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const path = await buildPersonalizedLearningPath(userId);
    return NextResponse.json({ ok: true, learningPath: path });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to build learning path" }, { status: 500 });
  }
}
