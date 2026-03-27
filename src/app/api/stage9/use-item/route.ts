import { NextResponse } from "next/server";
import { useStage9Item } from "@/lib/stage9Economy";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const userId = String(body?.userId || "").trim();
    const itemId = String(body?.itemId || "").trim();
    if (!userId || !itemId) return NextResponse.json({ ok: false, error: "userId and itemId required" }, { status: 400 });
    const result = await useStage9Item(userId, itemId);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: "Failed to use item", detail: String(err?.message ?? err) }, { status: 500 });
  }
}
