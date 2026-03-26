import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/adminGuard";
import { QuestionSetStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mapCandidateToDbQuestion } from "@/lib/contentEngine";
import { validateQuestionQuality, promptSignature } from "@/lib/questionQuality";

export async function POST(req: Request) {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try {
    const body = await req.json();
    const knowledgeBlockId = String(body?.knowledgeBlockId || "").trim();
    const replaceExisting = body?.replaceExisting === true;
    if (!knowledgeBlockId) return NextResponse.json({ error: "knowledgeBlockId is required" }, { status: 400 });
    const block = await (prisma as any).knowledgeBlock.findUnique({ where: { id: knowledgeBlockId }, include: { generatedQuestions: { where: { reviewStatus: { in: ["APPROVED", "EDITED"] } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } } });
    if (!block) return NextResponse.json({ error: "Knowledge block not found" }, { status: 404 });
    if (!block.generatedQuestions.length) return NextResponse.json({ error: "No approved generated questions to publish" }, { status: 400 });
    const setId = `kb-${block.sourceBlockId}`;
    const placementFilter: any = { lane: block.lane, isActive: true };
    if (block.lane === "TRAINING") placementFilter.startingPosition = block.startingPosition;
    if (block.lane === "CERTIFICATIONS") placementFilter.certExam = block.certExam;

    const incoming = block.generatedQuestions.map((q: any, index: number) => {
      const mapped = mapCandidateToDbQuestion({ prompt: q.prompt, type: q.type.toLowerCase() as any, difficulty: q.difficulty, explanation: q.explanation, tags: q.tags, data: (q.data as any) || {}, choices: Array.isArray(q.choices) ? (q.choices as string[]) : null, correctIndex: q.correctIndex }, index);
      const quality = validateQuestionQuality(mapped as any);
      return {
        ...mapped,
        data: {
          ...((mapped as any).data || {}),
          lifecycleStatus: "ACTIVE",
          qualityScore: quality.qualityScore,
          qualityIssues: quality.issues,
        },
      };
    });

    await prisma.$transaction(async (tx: any) => {
      await tx.questionSet.upsert({ where: { id: setId }, update: { name: block.setName, domain: block.domain, status: QuestionSetStatus.PUBLISHED }, create: { id: setId, name: block.setName, domain: block.domain, status: QuestionSetStatus.PUBLISHED } });
      if (replaceExisting) await tx.questionSetPlacement.updateMany({ where: placementFilter, data: { isActive: false } });
      const existingPlacement = await tx.questionSetPlacement.findFirst({ where: { setId, lane: block.lane, startingPosition: block.lane === "TRAINING" ? block.startingPosition : null, certExam: block.lane === "CERTIFICATIONS" ? block.certExam : null } });
      if (!existingPlacement) {
        await tx.questionSetPlacement.create({ data: { setId, lane: block.lane, startingPosition: block.lane === "TRAINING" ? block.startingPosition : null, certExam: block.lane === "CERTIFICATIONS" ? block.certExam : null, isActive: true } });
      } else if (!existingPlacement.isActive) {
        await tx.questionSetPlacement.update({ where: { id: existingPlacement.id }, data: { isActive: true } });
      }

      const existingQuestions = await tx.mCQQuestion.findMany({ where: { setId }, select: { prompt: true, type: true, choices: true, data: true } });
      const seen = new Set(existingQuestions.map((row: any) => promptSignature(row)));
      const toInsert = incoming.filter((row: any) => {
        const sig = promptSignature(row);
        if (seen.has(sig)) return false;
        seen.add(sig);
        return true;
      });

      if (replaceExisting) {
        await tx.mCQQuestion.deleteMany({ where: { setId } });
        if (incoming.length) await tx.mCQQuestion.createMany({ data: incoming.map((row: any) => ({ setId, ...row })) });
      } else if (toInsert.length) {
        const max = await tx.mCQQuestion.aggregate({ where: { setId }, _max: { sortOrder: true } });
        let nextOrder = Number(max?._max?.sortOrder ?? -1) + 1;
        await tx.mCQQuestion.createMany({ data: toInsert.map((row: any) => ({ setId, ...row, sortOrder: nextOrder++ })) });
      }

      await tx.generatedQuestion.updateMany({ where: { knowledgeBlockId: block.id, reviewStatus: { in: ["APPROVED", "EDITED"] } }, data: { publishedAt: new Date() } });
      await tx.knowledgeBlock.update({ where: { id: block.id }, data: { status: "APPROVED" } });
    });
    return NextResponse.json({ ok: true, setId, appendedCount: incoming.length, replaceExisting });
  } catch (e: any) { return NextResponse.json({ error: e?.message || "Failed to publish questions" }, { status: 500 }); }
}
