
import { getSessionUser } from "@/lib/auth/session";
import { claimDailyBonus } from "@/lib/stage9Economy";

export async function POST(req: Request) {
  try {
    const sessionUser = await getSessionUser();
    const userId = sessionUser?.id ?? null;
    if (!userId) return Response.json({ ok: false, error: "Sign in required" }, { status: 401 });
    const result = await claimDailyBonus(userId);
    return Response.json(result);
  } catch (err: any) {
    console.error("Daily bonus claim failed", err);
    return Response.json({ ok: false, error: "Failed to claim daily bonus" }, { status: 500 });
  }
}
