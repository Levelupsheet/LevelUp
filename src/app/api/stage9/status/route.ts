
import { getSessionUser } from "@/lib/auth/session";
import { getStage9Status } from "@/lib/stage9Economy";

export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    const userId = sessionUser?.id ?? null;
    if (!userId) return Response.json({ ok: false, error: "Sign in required" }, { status: 401 });
    const status = await getStage9Status(userId);
    return Response.json({ ok: true, ...status });
  } catch (err: any) {
    return Response.json({ ok: false, error: err?.message || "Failed to load Stage 9 status" }, { status: 500 });
  }
}
