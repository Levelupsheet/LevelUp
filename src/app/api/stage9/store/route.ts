
import { getSessionUser } from "@/lib/auth/session";
import { getStoreCatalog, purchaseStage9Item } from "@/lib/stage9Economy";

export async function GET() {
  return Response.json({ ok: true, store: getStoreCatalog() });
}

export async function POST(req: Request) {
  try {
    const sessionUser = await getSessionUser();
    const userId = sessionUser?.id ?? null;
    if (!userId) return Response.json({ ok: false, error: "Sign in required" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const itemId = String(body?.itemId || "").trim();
    if (!itemId) return Response.json({ ok: false, error: "itemId required" }, { status: 400 });
    const result = await purchaseStage9Item(userId, itemId);
    return Response.json(result, { status: result.ok ? 200 : 400 });
  } catch (err: any) {
    return Response.json({ ok: false, error: err?.message || "Failed to purchase store item" }, { status: 500 });
  }
}
