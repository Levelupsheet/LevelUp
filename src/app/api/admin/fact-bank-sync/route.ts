import { contentSignature, validateContent } from "@/lib/contentPipeline";
import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/adminGuard";
import { canonicalTrainingTarget, trainingPlacementFilter } from "@/lib/contentPools";
import { prisma } from "@/lib/prisma";
import { generateQuestionsFromBlock, mapCandidateToDbQuestion, normalizeKnowledgeBlock } from "@/lib/contentEngine";
import { QuestionSetStatus } from "@prisma/client";
import { promptSignature, validateQuestionQuality } from "@/lib/questionQuality";
export async function POST(req: Request) {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try {
    const body = await req.json();
    const incoming = Array.isArray(body?.blocks) ? body.blocks : Array.isArray(body) ? body : [];
    if (!incoming.length) return NextResponse.json({ error: "blocks array is required" }, { status: 400 });
    const summary = { blocksImported: 0, generatedQuestions: 0, approvedQuestions: 0, publishedQuestions: 0, skippedDuplicates: 0, rejectedWeak: 0, setsPublished: 0 };
    const results: Array<{ sourceBlockId: string; setId: string; lane: string; startingPosition: string | null; certExam: string | null; publishedCount: number }> = [];
    for (let i = 0; i < incoming.length; i += 1) {
      const block = normalizeKnowledgeBlock(incoming[i], i);
      const rawCandidates = generateQuestionsFromBlock(block);
      const localSeen = new Set<string>();
      const rejected: any[] = [];
      const candidates = rawCandidates.filter((q: any) => {
        const quality = validateQuestionQuality(q);
        if (validateContent(q).length || quality.qualityScore < 80 || quality.issues.length) {
          rejected.push({ payload: q, reason: [...validateContent(q), ...quality.issues].join("; ") });
          summary.rejectedWeak += 1;
          return false;
        }
        const signature = contentSignature(q);
        if (localSeen.has(signature)) {
          rejected.push({ payload: q, reason: "Duplicate generated content" });
          summary.skippedDuplicates += 1;
          return false;
        }
        localSeen.add(signature);
        return true;
      });
      const setId = `kb-${block.sourceBlockId}`;
      const trainingTarget = block.lane === "TRAINING" ? canonicalTrainingTarget(block) : { industry: null, careerPath: null, startingPosition: null };
      const placementFilter: any = { lane: block.lane, isActive: true };
      if (block.lane === "TRAINING") Object.assign(placementFilter, trainingPlacementFilter(block));
      if (block.lane === "CERTIFICATIONS") placementFilter.certExam = block.certExam;
      if (block.lane === "TEST_NOW") placementFilter.set = { domain: block.domain };
      await prisma.$transaction(async (tx: any) => {
        for (let idx = 0; idx < rejected.length; idx++) await tx.questionImportIssue.create({ data: { setId, rowIndex: idx + 1, ...rejected[idx] } });
        const savedBlock = await tx.knowledgeBlock.upsert({ where: { sourceBlockId: block.sourceBlockId }, update: { title: block.title, setName: block.setName, domain: block.domain, lane: block.lane, startingPosition: block.startingPosition, certExam: block.certExam, difficulty: block.difficulty, stage: block.stage, tags: block.tags, source: block.source, contentJson: block.contentJson, status: "APPROVED" }, create: { sourceBlockId: block.sourceBlockId, title: block.title, setName: block.setName, domain: block.domain, lane: block.lane, startingPosition: block.startingPosition, certExam: block.certExam, difficulty: block.difficulty, stage: block.stage, tags: block.tags, source: block.source, contentJson: block.contentJson, status: "APPROVED" } });
        // Preserve earlier reviewed/generated content and its publishing history.
        for (let idx = 0; idx < candidates.length; idx += 1) {
          const q = candidates[idx];
          await tx.generatedQuestion.create({ data: { knowledgeBlockId: savedBlock.id, prompt: q.prompt, type: q.type.toUpperCase(), data: q.data, choices: q.choices ?? (Array.isArray(q.data?.choices) ? q.data.choices : null), correctIndex: q.correctIndex ?? null, explanation: q.explanation, difficulty: q.difficulty, tags: q.tags, sortOrder: idx, reviewStatus: "PENDING" } });
        }
        await tx.questionSet.upsert({ where: { id: setId }, update: { name: block.setName, domain: block.domain, status: QuestionSetStatus.DRAFT }, create: { id: setId, name: block.setName, domain: block.domain, status: QuestionSetStatus.DRAFT } });
        const existing = await tx.mCQQuestion.findMany({ where: { setId }, select: { prompt: true, type: true, choices: true, correctIndex: true, data: true } });
        const seen = new Set(existing.map((q: any) => contentSignature(q)));
        const rows: any[] = [];
        let nextOrder = Number((await tx.mCQQuestion.aggregate({ where: { setId }, _max: { sortOrder: true } }))?._max?.sortOrder ?? -1) + 1;
        for (const q of candidates as any[]) {
          const mapped: any = mapCandidateToDbQuestion(q, nextOrder);
          const signature = contentSignature(mapped);
          if (seen.has(signature)) {
            summary.skippedDuplicates += 1;
            continue;
          }
          seen.add(signature);
          rows.push({ setId, ...mapped, data: { ...(mapped.data || {}), reviewStatus: "PENDING", lifecycleStatus: "ACTIVE" }, sortOrder: nextOrder++ });
        }
        if (rows.length) await tx.mCQQuestion.createMany({ data: rows });
        summary.generatedQuestions += rows.length;
      });
      summary.blocksImported += 1; summary.generatedQuestions += candidates.length; summary.approvedQuestions += 0;
      results.push({ sourceBlockId: block.sourceBlockId, setId, lane: block.lane, startingPosition: block.startingPosition, certExam: block.certExam, publishedCount: candidates.length });
    }
    return NextResponse.json({ ok: true, summary, results });
  } catch (e: any) { return NextResponse.json({ error: e?.message || "Failed to sync fact bank" }, { status: 500 }); }
}
