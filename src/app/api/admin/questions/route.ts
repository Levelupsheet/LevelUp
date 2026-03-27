import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/adminGuard";
import { prisma } from "@/lib/prisma";
import { normalizeQuestionType, safeArray, uniqueSortedNumbers } from "@/lib/questionTypes";
import { validateQuestionQuality } from "@/lib/questionQuality";


function isMissingSubdomainColumnError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("mcqquestion.subdomain") && message.includes("does not exist");
}

async function listQuestionsForSet(setId: string) {
  try {
    return await prisma.mCQQuestion.findMany({
      where: { setId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: 500,
    });
  } catch (e: any) {
    if (!isMissingSubdomainColumnError(e)) throw e;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "id", "setId", "prompt", "type", "data", "choices", "correctIndex", "sortOrder", "explanation", "difficulty", "tags", "testNowEligible", "isGoldenEligible", "goldenWeight", "goldenBonusXp", "createdAt", "updatedAt" FROM "MCQQuestion" WHERE "setId" = $1 ORDER BY "sortOrder" ASC, "createdAt" ASC LIMIT 500`,
      setId,
    );
    return Array.isArray(rows) ? rows : [];
  }
}

async function listExistingQuestionSignatures(setId: string) {
  try {
    return await prisma.mCQQuestion.findMany({
      where: { setId },
      select: { prompt: true, type: true, choices: true, data: true },
    });
  } catch (e: any) {
    if (!isMissingSubdomainColumnError(e)) throw e;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "prompt", "type", "choices", "data" FROM "MCQQuestion" WHERE "setId" = $1`,
      setId,
    );
    return Array.isArray(rows) ? rows : [];
  }
}

function stripUnsupportedColumnsForLegacyDb(payload: any) {
  const cloned = { ...(payload || {}) };
  delete (cloned as any).subdomain;
  return cloned;
}

async function createQuestionCompat(data: any) {
  try {
    return await prisma.mCQQuestion.create({ data });
  } catch (e: any) {
    if (!isMissingSubdomainColumnError(e)) throw e;
    return prisma.mCQQuestion.create({ data: stripUnsupportedColumnsForLegacyDb(data) });
  }
}

async function createManyQuestionsCompat(data: any[]) {
  try {
    return await prisma.mCQQuestion.createMany({ data: data as any });
  } catch (e: any) {
    if (!isMissingSubdomainColumnError(e)) throw e;
    return prisma.mCQQuestion.createMany({ data: data.map((row) => stripUnsupportedColumnsForLegacyDb(row)) as any });
  }
}

function toDbQuestionPayload(input: any, sortOrder: number) {
  const type = normalizeQuestionType(input?.type);
  const prompt = String(input?.prompt || "").trim();
  const explanation = input?.explanation ?? null;
  const difficulty = Number(input?.difficulty ?? 1) || 1;
  const tags = Array.isArray(input?.tags) ? input.tags : [];
  const sourceData = input?.data && typeof input.data === "object" ? input.data : {};
  const subdomain = String(input?.subdomain ?? (sourceData as any)?.subdomain ?? "").trim();
  const lifecycleStatus = String(input?.lifecycleStatus ?? (sourceData as any)?.lifecycleStatus ?? "ACTIVE").trim().toUpperCase();

  if (!prompt) throw new Error("Each question requires prompt");

  if (type === "multiple_choice" || type === "incident") {
    const choices = Array.isArray(input?.choices) ? input.choices : safeArray<string>((sourceData as any)?.choices);
    const correctIndex = typeof input?.correctIndex === "number" ? input.correctIndex : Number((sourceData as any)?.correctIndex ?? -1);
    if (!Array.isArray(choices) || choices.length < 2 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= choices.length) {
      throw new Error(`${type} questions require choices[] and a valid correctIndex`);
    }
    return {
      prompt,
      type: type.toUpperCase(),
      choices,
      correctIndex,
      data: {
        ...(sourceData || {}),
        ...(subdomain ? { subdomain } : {}),
        choices,
        correctIndex,
      },
      explanation,
      difficulty,
      tags,
      sortOrder,
    };
  }

  if (type === "true_false") {
    const answerRaw = String((sourceData as any)?.correctAnswer ?? input?.correctAnswer ?? (Number(input?.correctIndex ?? (sourceData as any)?.correctIndex ?? 0) === 0 ? "true" : "false")).trim().toLowerCase();
    const choices = ["True", "False"];
    const correctIndex = answerRaw === "false" ? 1 : 0;
    return {
      prompt,
      type: "TRUE_FALSE",
      choices,
      correctIndex,
      data: {
        ...sourceData,
        ...(subdomain ? { subdomain } : {}),
        choices,
        correctIndex,
        correctAnswer: correctIndex === 0,
      },
      explanation,
      difficulty,
      tags,
      sortOrder,
    };
  }

  if (type === "fill_blank") {
    const answers = safeArray<string>((sourceData as any)?.answers).map((value) => String(value).trim()).filter(Boolean);
    if (!answers.length) throw new Error("fill_blank questions require data.answers[]");
    return {
      prompt,
      type: "FILL_BLANK",
      choices: null,
      correctIndex: null,
      data: {
        ...sourceData,
        ...(subdomain ? { subdomain } : {}),
        answers,
      },
      explanation,
      difficulty,
      tags,
      sortOrder,
    };
  }

  if (type === "sequence_order") {
    const items = safeArray<string>((sourceData as any)?.items);
    const correctOrder = safeArray<string>((sourceData as any)?.correctOrder).length ? safeArray<string>((sourceData as any)?.correctOrder) : items;
    if (items.length < 2 || correctOrder.length < 2) throw new Error("sequence_order questions require data.items[] / data.correctOrder[]");
    return {
      prompt,
      type: "SEQUENCE_ORDER",
      choices: null,
      correctIndex: null,
      data: {
        ...sourceData,
        ...(subdomain ? { subdomain } : {}),
        items,
        correctOrder,
      },
      explanation,
      difficulty,
      tags,
      sortOrder,
    };
  }

  if (type === "multi_select") {
    const choices = safeArray<string>((sourceData as any)?.choices);
    const correctIndices = uniqueSortedNumbers((sourceData as any)?.correctIndices);
    if (choices.length < 2 || !correctIndices.length) throw new Error("multi_select questions require data.choices[] and data.correctIndices[]");
    return {
      prompt,
      type: "MULTI_SELECT",
      choices,
      correctIndex: null,
      data: {
        ...sourceData,
        ...(subdomain ? { subdomain } : {}),
        choices,
        correctIndices,
      },
      explanation,
      difficulty,
      tags,
      sortOrder,
    };
  }

  if (type === "matching") {
    const pairs = safeArray<any>((sourceData as any)?.pairs)
      .map((pair) => ({ left: String(pair?.left || "").trim(), right: String(pair?.right || "").trim() }))
      .filter((pair) => pair.left && pair.right);
    if (pairs.length < 2) throw new Error("matching questions require data.pairs[] with left/right values");
    return {
      prompt,
      type: "MATCHING",
      choices: null,
      correctIndex: null,
      data: {
        ...sourceData,
        ...(subdomain ? { subdomain } : {}),
        pairs,
        leftItems: pairs.map((pair) => pair.left),
        rightItems: Array.from(new Set(pairs.map((pair) => pair.right))),
        correctMatches: pairs.map((pair) => pair.right),
      },
      explanation,
      difficulty,
      tags,
      sortOrder,
    };
  }

  if (type === "cli_command") {
    const expectedCommands = safeArray<string>((sourceData as any)?.expectedCommands).map((value) => String(value).trim()).filter(Boolean);
    if (!expectedCommands.length) throw new Error("cli_command questions require data.expectedCommands[]");
    return {
      prompt,
      type: "CLI_COMMAND",
      choices: null,
      correctIndex: null,
      data: {
        ...sourceData,
        ...(subdomain ? { subdomain } : {}),
        expectedCommands,
      },
      explanation,
      difficulty,
      tags,
      sortOrder,
    };
  }

  if (type === "log_analysis") {
    const logText = String((sourceData as any)?.logText || (sourceData as any)?.log || "").trim();
    const answers = safeArray<string>((sourceData as any)?.answers).map((value) => String(value).trim()).filter(Boolean);
    const expectedFindings = safeArray<string>((sourceData as any)?.expectedFindings).map((value) => String(value).trim()).filter(Boolean);
    const acceptable = answers.length ? answers : expectedFindings;
    if (!logText || !acceptable.length) throw new Error("log_analysis questions require data.logText and data.answers[] or data.expectedFindings[]");
    return {
      prompt,
      type: "LOG_ANALYSIS",
      choices: null,
      correctIndex: null,
      data: {
        ...sourceData,
        ...(subdomain ? { subdomain } : {}),
        logText,
        answers: acceptable,
        expectedFindings: expectedFindings.length ? expectedFindings : acceptable,
      },
      explanation,
      difficulty,
      tags,
      sortOrder,
    };
  }

  throw new Error(`Unsupported question type: ${type}`);
}


function normalizePromptSignature(input: any) {
  const prompt = String(input?.prompt || "").trim().toLowerCase().replace(/\s+/g, " ");
  const type = String(input?.type || "").trim().toUpperCase();
  const data = input?.data && typeof input.data === "object" ? input.data : {};
  const choices = Array.isArray(input?.choices) ? input.choices : Array.isArray((data as any)?.choices) ? (data as any).choices : [];
  const subdomain = String((data as any)?.subdomain || input?.subdomain || "").trim().toLowerCase();
  return JSON.stringify({ prompt, type, subdomain, choices: choices.map((v: any) => String(v).trim().toLowerCase()) });
}

export async function GET(req: Request) {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try {
    const { searchParams } = new URL(req.url);
    const setId = searchParams.get("setId");
    if (!setId) return NextResponse.json({ error: "setId is required" }, { status: 400 });

    const questions = await listQuestionsForSet(setId);
    return NextResponse.json({ questions });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try {
    const body = await req.json();
    const setId = body.setId;
    if (!setId) return NextResponse.json({ error: "setId is required" }, { status: 400 });

    const max = await prisma.mCQQuestion.aggregate({
      where: { setId },
      _max: { sortOrder: true },
    });
    let nextOrder = (max._max.sortOrder ?? -1) + 1;

    if (Array.isArray(body.questions)) {
      const incoming = body.questions;
      if (incoming.length === 0) return NextResponse.json({ inserted: 0, skippedDuplicates: 0 });

      const existingQuestions = await listExistingQuestionSignatures(setId);
      const seen = new Set(existingQuestions.map((q) => normalizePromptSignature(q)));
      const localSeen = new Set<string>();
      const data: any[] = [];
      let skippedDuplicates = 0;

      for (const q of incoming) {
        const normalized = toDbQuestionPayload(q, typeof q.sortOrder === "number" ? q.sortOrder : nextOrder++);
        const quality = validateQuestionQuality(normalized as any);
        const payload = { setId, ...normalized, data: { ...((normalized as any).data || {}), lifecycleStatus: String((q?.lifecycleStatus || (normalized as any)?.data?.lifecycleStatus || "ACTIVE")).toUpperCase(), qualityScore: quality.qualityScore, qualityIssues: quality.issues } };
        const signature = normalizePromptSignature(payload);
        if (seen.has(signature) || localSeen.has(signature)) {
          skippedDuplicates += 1;
          continue;
        }
        localSeen.add(signature);
        data.push(payload);
      }

      if (!data.length) return NextResponse.json({ inserted: 0, skippedDuplicates });
      const res = await createManyQuestionsCompat(data as any);
      return NextResponse.json({ inserted: res.count, skippedDuplicates });
    }

    const payload = toDbQuestionPayload(body, typeof body.sortOrder === "number" ? body.sortOrder : nextOrder);
    const quality = validateQuestionQuality(payload as any);
    const q = await createQuestionCompat({ setId, ...(payload as any), data: { ...((payload as any).data || {}), lifecycleStatus: String((body?.lifecycleStatus || (payload as any)?.data?.lifecycleStatus || "ACTIVE")).toUpperCase(), qualityScore: quality.qualityScore, qualityIssues: quality.issues } });
    return NextResponse.json({ question: q });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try {
    const body = await req.json();

    if (body?.setId && Array.isArray(body?.order)) {
      const order = body.order as string[];
      await prisma.$transaction(order.map((id, idx) =>
        prisma.mCQQuestion.update({
          where: { id },
          data: { sortOrder: idx },
        })
      ));
      return NextResponse.json({ ok: true });
    }

    if (body?.id) {
      const id = String(body.id).trim();
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const updateData: any = {};
      if (typeof body.prompt === "string") updateData.prompt = body.prompt.trim();
      if (body.difficulty !== undefined) updateData.difficulty = Math.max(1, Math.min(5, Number(body.difficulty) || 1));
      if (body.explanation !== undefined) updateData.explanation = body.explanation === null ? null : String(body.explanation);
      if (body.lifecycleStatus !== undefined) updateData.data = { lifecycleStatus: String(body.lifecycleStatus || "ACTIVE").toUpperCase() } as any;
      if (Array.isArray(body.tags)) updateData.tags = body.tags.map((v: any) => String(v).trim()).filter(Boolean);
      if (body.testNowEligible !== undefined) updateData.testNowEligible = Boolean(body.testNowEligible);
      if (body.isGoldenEligible !== undefined) updateData.isGoldenEligible = Boolean(body.isGoldenEligible);
      if (body.goldenWeight !== undefined) updateData.goldenWeight = Math.max(1, Number(body.goldenWeight) || 1);
      if (body.goldenBonusXp !== undefined) updateData.goldenBonusXp = Math.max(0, Number(body.goldenBonusXp) || 0);
      const existing = await prisma.mCQQuestion.findUnique({ where: { id } });
      const mergedData = { ...(((existing as any)?.data && typeof (existing as any).data === "object") ? (existing as any).data : {}), ...((updateData.data && typeof updateData.data === "object") ? updateData.data : {}) } as any;
      const quality = validateQuestionQuality({
        prompt: updateData.prompt ?? (existing as any)?.prompt,
        type: (existing as any)?.type,
        choices: (existing as any)?.choices,
        correctIndex: (existing as any)?.correctIndex,
        data: mergedData,
        explanation: updateData.explanation ?? (existing as any)?.explanation,
      });
      updateData.data = { ...mergedData, qualityScore: quality.qualityScore, qualityIssues: quality.issues };
      const question = await prisma.mCQQuestion.update({ where: { id }, data: updateData });
      return NextResponse.json({ ok: true, question, quality });
    }

    if (Array.isArray(body?.ids) && body?.patch && typeof body.patch === "object") {
      const ids = body.ids.map((v: any) => String(v).trim()).filter(Boolean);
      if (!ids.length) return NextResponse.json({ error: "ids are required" }, { status: 400 });
      const patch: any = {};
      if (body.patch.testNowEligible !== undefined) patch.testNowEligible = Boolean(body.patch.testNowEligible);
      if (body.patch.isGoldenEligible !== undefined) patch.isGoldenEligible = Boolean(body.patch.isGoldenEligible);
      if (body.patch.goldenWeight !== undefined) patch.goldenWeight = Math.max(1, Number(body.patch.goldenWeight) || 1);
      if (body.patch.goldenBonusXp !== undefined) patch.goldenBonusXp = Math.max(0, Number(body.patch.goldenBonusXp) || 0);
      if (body.patch.difficulty !== undefined) patch.difficulty = Math.max(1, Math.min(5, Number(body.patch.difficulty) || 1));
      const res = await prisma.mCQQuestion.updateMany({ where: { id: { in: ids } }, data: patch });
      return NextResponse.json({ ok: true, updated: res.count });
    }

    return NextResponse.json({ error: "Unsupported PATCH body" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
