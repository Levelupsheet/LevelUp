import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/adminGuard";
import { QuestionSetStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mapCandidateToDbQuestion } from "@/lib/contentEngine";

export async function POST(req: Request) {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try {
    const body = await req.json();
    const knowledgeBlockId = String(body?.knowledgeBlockId || "").trim();
    if (!knowledgeBlockId) return NextResponse.json({ error: "knowledgeBlockId is required" }, { status: 400 });

    const block = await prisma.knowledgeBlock.findUnique({
      where: { id: knowledgeBlockId },
      include: { generatedQuestions: { where: { reviewStatus: { in: ["APPROVED", "EDITED"] } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
    });

    if (!block) return NextResponse.json({ error: "Knowledge block not found" }, { status: 404 });
    if (!block.generatedQuestions.length) return NextResponse.json({ error: "No approved generated questions to publish" }, { status: 400 });

    const setId = `kb-${block.sourceBlockId}`;
    const placementId = `kb-placement-${block.sourceBlockId}`;

    await prisma.questionSet.upsert({
      where: { id: setId },
      update: { name: block.setName, domain: block.domain, status: QuestionSetStatus.PUBLISHED },
      create: { id: setId, name: block.setName, domain: block.domain, status: QuestionSetStatus.PUBLISHED },
    });

    await prisma.questionSetPlacement.upsert({
      where: { id: placementId },
      update: { lane: block.lane, startingPosition: block.startingPosition, certExam: block.certExam, isActive: true },
      create: { id: placementId, setId, lane: block.lane, startingPosition: block.startingPosition, certExam: block.certExam, isActive: true },
    });

    await prisma.mCQQuestion.deleteMany({ where: { setId } });

    const data = block.generatedQuestions.map((q, index) => mapCandidateToDbQuestion({
      prompt: q.prompt,
      type: q.type.toLowerCase() as any,
      difficulty: q.difficulty,
      explanation: q.explanation,
      tags: q.tags,
      data: (q.data as any) || {},
      choices: Array.isArray(q.choices) ? (q.choices as string[]) : null,
      correctIndex: q.correctIndex,
    }, index));

    await prisma.mCQQuestion.createMany({ data: data.map((row) => ({ setId, ...row })) });
    await prisma.generatedQuestion.updateMany({ where: { knowledgeBlockId: block.id, reviewStatus: { in: ["APPROVED", "EDITED"] } }, data: { publishedAt: new Date() } });
    await prisma.knowledgeBlock.update({ where: { id: block.id }, data: { status: "APPROVED" } });

    return NextResponse.json({ ok: true, setId, publishedCount: data.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to publish questions" }, { status: 500 });
  }
}
