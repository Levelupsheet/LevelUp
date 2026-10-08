import { NextResponse } from "next/server";
import { useStage9Item } from "@/lib/stage9Economy";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const sessionUser = await getSessionUser();
    const userId = String(sessionUser?.id || "").trim();
    const itemId = String(body?.itemId || "").trim();
    if (!userId) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
    if (!itemId) return NextResponse.json({ ok: false, error: "itemId required" }, { status: 400 });
    const actionKey = String(body?.actionKey || "").trim();
    if (!actionKey || actionKey.length > 200) return NextResponse.json({ ok: false, error: "actionKey required" }, { status: 400 });
    const questionId = actionKey.split(":")[0];
    const question = await prisma.gameSessionQuestion.findUnique({ where: { id: questionId }, include: { session: true } });
    const prior = await prisma.rewardClaim.findUnique({ where: { claimKey: `use-item:${userId}:${actionKey}` } });
    if (!prior && (!question || question.session.userId !== userId || question.session.status !== "ACTIVE" || (question.answered && itemId !== "extra_life") || (itemId === "extra_life" && question.session.trainingMode !== "BOSS"))) {
      return NextResponse.json({ ok: false, error: "Active owned battle question required" }, { status: 400 });
    }
    const result = await useStage9Item(userId, itemId, actionKey, {sessionQuestionId:questionId});
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: "Failed to use item", detail: String(err?.message ?? err) }, { status: 500 });
  }
}
