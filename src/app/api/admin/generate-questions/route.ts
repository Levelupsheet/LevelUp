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
    const autoApprove = body?.autoApprove !== false;
    if (!ids.length) return NextResponse.json({ error: "knowledgeBlockIds required" }, { status: 400 });

    const blocks = await prisma.knowledgeBlock.findMany({ where: { id: { in: ids } } });
    if (!blocks.length) return NextResponse.json({ error: "No matching knowledge blocks found" }, { status: 404 });

    let generatedCount = 0;
    let rejectedCount = 0;
    const touched: string[] = [];

    for (const blockRecord of blocks) {
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
      const rawCandidates = generateQuestionsFromBlock(normalized);
      const candidates = rawCandidates.filter((q) => {
        const quality = validateQuestionQuality(q);
        return quality.qualityScore >= 80 && quality.issues.length === 0;
      });

      rejectedCount += rawCandidates.length - candidates.length;

      await prisma.generatedQuestion.deleteMany({ where: { knowledgeBlockId: blockRecord.id } });
      for (let i = 0; i < candidates.length; i += 1) {
        const q = candidates[i];
        await prisma.generatedQuestion.create({
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

      await prisma.knowledgeBlock.update({ where: { id: blockRecord.id }, data: { status: "PROCESSED" } });
      generatedCount += candidates.length;
      touched.push(blockRecord.id);
    }

    return NextResponse.json({ ok: true, generatedCount, rejectedCount, autoApproved: autoApprove ? generatedCount : 0, knowledgeBlockIds: touched });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to generate questions" }, { status: 500 });
  }
}
