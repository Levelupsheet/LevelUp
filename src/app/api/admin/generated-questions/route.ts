import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/adminGuard";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try {
    const url = new URL(req.url);
    const knowledgeBlockId = url.searchParams.get("knowledgeBlockId");
    const where = knowledgeBlockId ? { knowledgeBlockId } : {};
    const questions = await prisma.generatedQuestion.findMany({
      where,
      orderBy: [{ knowledgeBlockId: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      take: 500,
      include: { knowledgeBlock: { select: { title: true, setName: true } } },
    });
    return NextResponse.json({ questions });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load generated questions" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try {
    const body = await req.json();
    const id = String(body?.id || "").trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const question = await prisma.generatedQuestion.update({
      where: { id },
      data: {
        prompt: typeof body.prompt === "string" ? body.prompt : undefined,
        explanation: body.explanation === undefined ? undefined : body.explanation,
        difficulty: body.difficulty === undefined ? undefined : Number(body.difficulty),
        tags: Array.isArray(body.tags) ? body.tags : undefined,
        data: body.data && typeof body.data === "object" ? body.data : undefined,
        choices: Array.isArray(body.choices) ? body.choices : body.choices === null ? null : undefined,
        correctIndex: body.correctIndex === undefined ? undefined : body.correctIndex === null ? null : Number(body.correctIndex),
        reviewStatus: typeof body.reviewStatus === "string" ? body.reviewStatus : undefined,
        editorNotes: typeof body.editorNotes === "string" ? body.editorNotes : body.editorNotes === null ? null : undefined,
      },
    });

    return NextResponse.json({ ok: true, question });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to update generated question" }, { status: 500 });
  }
}
