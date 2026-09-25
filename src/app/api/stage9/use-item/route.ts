import { NextResponse } from "next/server";
import { useStage9Item } from "@/lib/stage9Economy";
import { getSessionUser } from "@/lib/auth/session";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const sessionUser = await getSessionUser();
    const userId = String(sessionUser?.id || "").trim();
    const itemId = String(body?.itemId || "").trim();
    if (!userId) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
    if (!itemId) return NextResponse.json({ ok: false, error: "itemId required" }, { status: 400 });
    const result = await useStage9Item(userId, itemId);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: "Failed to use item", detail: String(err?.message ?? err) }, { status: 500 });
  }
}
