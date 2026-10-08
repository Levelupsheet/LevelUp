import { duplicateContentReason, generateContentReport } from '@/lib/contentGeneration';
import { contentSignature, validateContent } from "@/lib/contentPipeline";
import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/adminGuard";
import { prisma } from "@/lib/prisma";
import { generateQuestionsFromBlock, normalizeKnowledgeBlock } from "@/lib/contentEngine";
import { validateQuestionQuality } from "@/lib/questionQuality";

export async function POST(req: Request) {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try {
    const body = await req.json();
    const ids = Array.isArray(body?.knowledgeBlockIds) ? body.knowledgeBlockIds.filter(Boolean) : [];
    const autoApprove = false; // Generation always precedes human review.
    if (!ids.length) return NextResponse.json({ error: "knowledgeBlockIds required" }, { status: 400 });

    const blocks = await prisma.knowledgeBlock.findMany({ where: { id: { in: ids } } });
    if (!blocks.length) return NextResponse.json({ error: "No matching knowledge blocks found" }, { status: 404 });

    let generatedCount = 0;
    let rejectedCount = 0;
    const touched: string[] = [];

    for (const blockRecord of blocks) {
      await prisma.$transaction(async (tx: any) => {
      await tx.$queryRaw`SELECT "id" FROM "KnowledgeBlock" WHERE "setName" = ${blockRecord.setName} AND "domain"::text = ${blockRecord.domain} AND "lane"::text = ${blockRecord.lane} ORDER BY "id" FOR UPDATE`;
      const normalized = normalizeKnowledgeBlock({
        ...(blockRecord.contentJson as any),
        id: blockRecord.sourceBlockId,
        title: blockRecord.title,
        setName: blockRecord.setName,
        domain: blockRecord.domain,
        lane: blockRecord.lane,
        startingPosition: blockRecord.startingPosition,
        certExam: blockRecord.certExam,
        difficulty: blockRecord.difficulty,
        stage: blockRecord.stage,
        tags: blockRecord.tags,
        source: blockRecord.source,
      });
      const generation = generateContentReport(normalized);
      const rawCandidates = generation.questions;
      const setId = `kb-${blockRecord.sourceBlockId}`;
      await tx.questionSet.upsert({ where: {id:setId}, update:{}, create:{id:setId,name:blockRecord.setName,domain:blockRecord.domain,status:'DRAFT',industry:(normalized.contentJson as any).industry || null,careerPath:(normalized.contentJson as any).careerPath || null} });
      for (const issue of generation.issues) { rejectedCount++; await tx.questionImportIssue.create({data:{setId,rowIndex:issue.row,reason:`${issue.section}: ${issue.reason}`,payload:issue.payload ?? {originalPayload:null}}}); }
      const existing = await tx.generatedQuestion.findMany({where:{knowledgeBlock:{setName:blockRecord.setName,domain:blockRecord.domain,lane:blockRecord.lane}}});
      const seen = [...existing];
      const candidates: typeof rawCandidates = [];
      for (let rowIndex=0;rowIndex<rawCandidates.length;rowIndex++) {
        const q=rawCandidates[rowIndex]; const errors=validateContent(q);const duplicate=duplicateContentReason(q,seen);
        const reason=errors.length ? errors.join('; ') : duplicate || '';
        if (reason) { rejectedCount++; await tx.questionImportIssue.create({data:{setId,rowIndex:rowIndex+1,reason,payload:q as any}}); continue; }
        seen.push(q);candidates.push(q);
      }

      for (let i = 0; i < candidates.length; i += 1) {
        const q = candidates[i];
        await tx.generatedQuestion.create({
          data: {
            knowledgeBlockId: blockRecord.id,
            prompt: q.prompt,
            type: q.type.toUpperCase() as any,
            data: q.data,
            choices: q.choices ?? (Array.isArray(q.data?.choices) ? (q.data.choices as any) : null),
            correctIndex: q.correctIndex ?? null,
            explanation: q.explanation,
            difficulty: q.difficulty,
            tags: q.tags,
            sortOrder: i,
            reviewStatus: autoApprove ? "APPROVED" : "PENDING",
          },
        });
      }

      await tx.knowledgeBlock.update({ where: { id: blockRecord.id }, data: { status: "PROCESSED" } });
      generatedCount += candidates.length;
      touched.push(blockRecord.id);
      }, {timeout:60000,maxWait:10000});
    }

    return NextResponse.json({ ok: true, generatedCount, rejectedCount, autoApproved: autoApprove ? generatedCount : 0, knowledgeBlockIds: touched });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to generate questions" }, { status: 500 });
  }
}
