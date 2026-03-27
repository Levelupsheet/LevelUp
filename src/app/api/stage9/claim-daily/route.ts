
import { getRequestUserId } from "@/app/api/_lib/authUser";
import { claimDailyBonus } from "@/lib/stage9Economy";

export async function POST(req: Request) {
  try {
    const userId = await getRequestUserId(req);
    if (!userId) return Response.json({ ok: false, error: "userId required" }, { status: 400 });
    const result = await claimDailyBonus(userId);
    return Response.json(result);
  } catch (err: any) {
    return Response.json({ ok: false, error: err?.message || "Failed to claim daily bonus" }, { status: 500 });
  }
}
