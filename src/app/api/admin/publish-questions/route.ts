import { duplicateContentReason } from '@/lib/contentGeneration';
import { validateContent } from "@/lib/contentPipeline";
import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/adminGuard";
import { QuestionSetStatus } from "@prisma/client";
import { canonicalTrainingTarget, trainingPlacementFilter } from "@/lib/contentPools";
import { prisma } from "@/lib/prisma";
import { mapCandidateToDbQuestion } from "@/lib/contentEngine";
import { clusterQuestionsBySimilarity, validateQuestionQuality, promptSignature } from "@/lib/questionQuality";

export async function POST(req: Request) {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try {
    const body = await req.json();
    const knowledgeBlockId = String(body?.knowledgeBlockId || "").trim();
    const replaceExisting = body?.replaceExisting === true;
    const requestedSetId = String(body?.targetSetId || "").trim();
    if (!knowledgeBlockId) return NextResponse.json({ error: "knowledgeBlockId is required" }, { status: 400 });
    const block = await (prisma as any).knowledgeBlock.findUnique({ where: { id: knowledgeBlockId }, include: { generatedQuestions: { where: { reviewStatus: { in: ["APPROVED", "EDITED"] } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } } });
    if (!block) return NextResponse.json({ error: "Knowledge block not found" }, { status: 404 });
    if (!block.generatedQuestions.length) return NextResponse.json({ error: "No approved generated questions to publish" }, { status: 400 });
    const defaultSetId = `kb-${block.sourceBlockId}`;
    const targetSet = requestedSetId ? await prisma.questionSet.findUnique({ where: { id: requestedSetId } }) : null;
    if (requestedSetId && !targetSet) return NextResponse.json({ error: "Selected destination bank was not found" }, { status: 404 });
    const setId = targetSet?.id || defaultSetId;
    const setName = targetSet?.name || block.setName;
    const setDomain = targetSet?.domain || block.domain;
    const sourceTarget = {...(block.contentJson as any || {}), startingPosition:block.startingPosition};
    const trainingTarget = block.lane === "TRAINING" ? canonicalTrainingTarget(sourceTarget) : { industry: null, careerPath: null, startingPosition: null };
    if (block.lane === "TRAINING" && !trainingTarget.careerPath) return NextResponse.json({error:"Provide industry and careerPath before publishing training content"},{status:400});
    if (block.lane === "CERTIFICATIONS" && !block.certExam) return NextResponse.json({error:"Provide a certification destination before publishing"},{status:400});
    const placementFilter: any = { lane: block.lane, isActive: true };
    if (block.lane === "TRAINING") Object.assign(placementFilter, trainingPlacementFilter(trainingTarget));
    if (block.lane === "CERTIFICATIONS") placementFilter.certExam = block.certExam;
    if (block.lane === "TEST_NOW") placementFilter.set = { domain: setDomain };

    const contentIssues = block.generatedQuestions.flatMap((q: any) => validateContent(q).map(issue => ({ id: q.id, issue })));
    if (contentIssues.length) return NextResponse.json({ error: "Unsupported or malformed generated content", contentIssues }, { status: 400 });
    const reviewedQuality = block.generatedQuestions.map((q: any) => ({ id: q.id, prompt: q.prompt, quality: validateQuestionQuality(q as any) }));
    const blockedQuality = reviewedQuality.filter((row: any) => row.quality.issues.length > 0 || row.quality.qualityScore < 70);
    if (blockedQuality.length) {
      return NextResponse.json({
        error: "Publishing blocked: approved questions still have quality issues.",
        blockedQuestions: blockedQuality.map((row: any) => ({ id: row.id, prompt: row.prompt, qualityScore: row.quality.qualityScore, issues: row.quality.issues })),
      }, { status: 400 });
    }
    const publishableQuestions = block.generatedQuestions;

    const incoming = publishableQuestions.map((q: any, index: number) => {
      const mapped = mapCandidateToDbQuestion({ prompt: q.prompt, type: q.type.toLowerCase() as any, difficulty: q.difficulty, explanation: q.explanation, tags: q.tags, data: (q.data as any) || {}, goldenEligible:Boolean(q.data?.goldenEligible), testNowEligible:block.lane === "TEST_NOW", choices: Array.isArray(q.choices) ? (q.choices as string[]) : null, correctIndex: q.correctIndex }, index);
      const quality = validateQuestionQuality(mapped as any);
      return {
        ...mapped,
        data: {
          ...((mapped as any).data || {}),
          lifecycleStatus: "ACTIVE", reviewStatus: "APPROVED",
          qualityScore: quality.qualityScore,
          qualityIssues: quality.issues,
        },
      };
    });

    const publishResult: {
      insertedCount: number;
      skippedDuplicateCount: number;
      activeQuestionCount: number;
    } = await prisma.$transaction(async (tx: any) => {
      await tx.questionSet.upsert({ where: { id: setId }, update: { status: QuestionSetStatus.PUBLISHED }, create: { id: setId, name: setName, domain: setDomain, status: QuestionSetStatus.PUBLISHED,industry:trainingTarget.industry,careerPath:trainingTarget.careerPath } });
      await tx.$queryRaw`SELECT "id" FROM "QuestionSet" WHERE "id" = ${setId} FOR UPDATE`;
      if (replaceExisting) await tx.questionSetPlacement.updateMany({ where: placementFilter, data: { isActive: false } });
      const existingPlacement = await tx.questionSetPlacement.findFirst({ where: { setId, lane: block.lane, ...trainingTarget, certExam: block.lane === "CERTIFICATIONS" ? block.certExam : null } });
      if (!existingPlacement) {
        await tx.questionSetPlacement.create({ data: { setId, lane: block.lane, ...trainingTarget, certExam: block.lane === "CERTIFICATIONS" ? block.certExam : null, isActive: true } });
      } else if (!existingPlacement.isActive) {
        await tx.questionSetPlacement.update({ where: { id: existingPlacement.id }, data: { isActive: true } });
      }

      const existingQuestions = await tx.mCQQuestion.findMany({ where: { setId }, select: { prompt: true, type: true, choices: true, correctIndex: true, data: true } });
      const seen = replaceExisting ? [] : [...existingQuestions];
      const toInsert = incoming.filter((row: any) => {
        const duplicate = duplicateContentReason(row,seen);
        if (duplicate) return false;
        seen.push(row);
        return true;
      });

      if (replaceExisting) {
        const previous = await tx.mCQQuestion.findMany({ where: { setId } });
        for (const q of previous) await tx.mCQQuestion.update({ where: { id: q.id }, data: { data: { ...(q.data || {}), lifecycleStatus: "ARCHIVED" } } });
        if (toInsert.length) await tx.mCQQuestion.createMany({ data: toInsert.map((row: any) => ({ setId, ...row })) });
      } else if (toInsert.length) {
        const max = await tx.mCQQuestion.aggregate({ where: { setId }, _max: { sortOrder: true } });
        let nextOrder = Number(max?._max?.sortOrder ?? -1) + 1;
        await tx.mCQQuestion.createMany({ data: toInsert.map((row: any) => ({ setId, ...row, sortOrder: nextOrder++ })) });
      }

      await tx.generatedQuestion.updateMany({ where: { knowledgeBlockId: block.id, reviewStatus: { in: ["APPROVED", "EDITED"] } }, data: { publishedAt: new Date() } });
      await tx.knowledgeBlock.update({ where: { id: block.id }, data: { status: "APPROVED" } });
      const activeQuestionCount = (await tx.mCQQuestion.findMany({where:{setId}})).filter((q:any)=>q.data?.lifecycleStatus !== "ARCHIVED").length;
      return {
        insertedCount: toInsert.length,
        skippedDuplicateCount: Math.max(0, incoming.length - toInsert.length),
        activeQuestionCount,
      };
    });
    return NextResponse.json({
      ok: true,
      setId,
      setName,
      publishedCount: publishResult.insertedCount,
      appendedCount: publishResult.insertedCount,
      skippedDuplicateCount: publishResult.skippedDuplicateCount,
      autoRemovedSimilarCount: 0,
      activeQuestionCount: publishResult.activeQuestionCount,
      replaceExisting,
    });
  } catch (e: any) { return NextResponse.json({ error: e?.message || "Failed to publish questions" }, { status: 500 }); }
}
