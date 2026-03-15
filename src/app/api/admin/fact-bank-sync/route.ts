import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/adminGuard";
import { prisma } from "@/lib/prisma";
import { generateQuestionsFromBlock, mapCandidateToDbQuestion, normalizeKnowledgeBlock } from "@/lib/contentEngine";
import { QuestionSetStatus } from "@prisma/client";
export async function POST(req: Request) {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try {
    const body = await req.json();
    const incoming = Array.isArray(body?.blocks) ? body.blocks : Array.isArray(body) ? body : [];
    if (!incoming.length) return NextResponse.json({ error: "blocks array is required" }, { status: 400 });
    const summary = { blocksImported: 0, generatedQuestions: 0, approvedQuestions: 0, publishedQuestions: 0, setsPublished: 0 };
    const results: Array<{ sourceBlockId: string; setId: string; lane: string; startingPosition: string | null; certExam: string | null; publishedCount: number }> = [];
    for (let i = 0; i < incoming.length; i += 1) {
      const block = normalizeKnowledgeBlock(incoming[i], i);
      const candidates = generateQuestionsFromBlock(block);
      const setId = `kb-${block.sourceBlockId}`;
      const placementFilter: any = { lane: block.lane, isActive: true };
      if (block.lane === "TRAINING") placementFilter.startingPosition = block.startingPosition;
      if (block.lane === "CERTIFICATIONS") placementFilter.certExam = block.certExam;
      await prisma.$transaction(async (tx: any) => {
        const savedBlock = await tx.knowledgeBlock.upsert({ where: { sourceBlockId: block.sourceBlockId }, update: { title: block.title, setName: block.setName, domain: block.domain, lane: block.lane, startingPosition: block.startingPosition, certExam: block.certExam, difficulty: block.difficulty, stage: block.stage, tags: block.tags, source: block.source, contentJson: block.contentJson, status: "APPROVED" }, create: { sourceBlockId: block.sourceBlockId, title: block.title, setName: block.setName, domain: block.domain, lane: block.lane, startingPosition: block.startingPosition, certExam: block.certExam, difficulty: block.difficulty, stage: block.stage, tags: block.tags, source: block.source, contentJson: block.contentJson, status: "APPROVED" } });
        await tx.generatedQuestion.deleteMany({ where: { knowledgeBlockId: savedBlock.id } });
        for (let idx = 0; idx < candidates.length; idx += 1) {
          const q = candidates[idx];
          await tx.generatedQuestion.create({ data: { knowledgeBlockId: savedBlock.id, prompt: q.prompt, type: q.type.toUpperCase(), data: q.data, choices: q.choices ?? (Array.isArray(q.data?.choices) ? q.data.choices : null), correctIndex: q.correctIndex ?? null, explanation: q.explanation, difficulty: q.difficulty, tags: q.tags, sortOrder: idx, reviewStatus: "APPROVED", publishedAt: new Date() } });
        }
        await tx.questionSet.upsert({ where: { id: setId }, update: { name: block.setName, domain: block.domain, status: QuestionSetStatus.PUBLISHED }, create: { id: setId, name: block.setName, domain: block.domain, status: QuestionSetStatus.PUBLISHED } });
        await tx.questionSetPlacement.updateMany({ where: placementFilter, data: { isActive: false } });
        await tx.questionSetPlacement.create({ data: { setId, lane: block.lane, startingPosition: block.lane === "TRAINING" ? block.startingPosition : null, certExam: block.lane === "CERTIFICATIONS" ? block.certExam : null, isActive: true } });
        await tx.mCQQuestion.deleteMany({ where: { setId } });
        const rows = candidates.map((q: any, idx: number) => ({ setId, ...mapCandidateToDbQuestion(q, idx) }));
        if (rows.length) await tx.mCQQuestion.createMany({ data: rows });
      });
      summary.blocksImported += 1; summary.generatedQuestions += candidates.length; summary.approvedQuestions += candidates.length; summary.publishedQuestions += candidates.length; summary.setsPublished += 1;
      results.push({ sourceBlockId: block.sourceBlockId, setId, lane: block.lane, startingPosition: block.startingPosition, certExam: block.certExam, publishedCount: candidates.length });
    }
    return NextResponse.json({ ok: true, summary, results });
  } catch (e: any) { return NextResponse.json({ error: e?.message || "Failed to sync fact bank" }, { status: 500 }); }
}
