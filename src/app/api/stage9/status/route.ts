
import { getRequestUserId } from "@/app/api/_lib/authUser";
import { getStage9Status } from "@/lib/stage9Economy";

export async function GET(req: Request) {
  try {
    const userId = await getRequestUserId(req);
    if (!userId) return Response.json({ ok: false, error: "userId required" }, { status: 400 });
    const status = await getStage9Status(userId);
    return Response.json({ ok: true, ...status });
  } catch (err: any) {
    return Response.json({ ok: false, error: err?.message || "Failed to load Stage 9 status" }, { status: 500 });
  }
}
