import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/adminGuard";
import { prisma } from "@/lib/prisma";
import { normalizeQuestionType, safeArray, uniqueSortedNumbers } from "@/lib/questionTypes";

function toDbQuestionPayload(input: any, sortOrder: number) {
  const type = normalizeQuestionType(input?.type);
  const prompt = String(input?.prompt || "").trim();
  const explanation = input?.explanation ?? null;
  const difficulty = Number(input?.difficulty ?? 1) || 1;
  const tags = Array.isArray(input?.tags) ? input.tags : [];
  const sourceData = input?.data && typeof input.data === "object" ? input.data : {};

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
        choices,
        correctIndex,
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
        choices,
        correctIndices,
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
        expectedCommands,
      },
      explanation,
      difficulty,
      tags,
      sortOrder,
    };
  }

  throw new Error(`Unsupported question type: ${type}`);
}

/**
 * GET /api/admin/questions?setId=...
 * Returns questions ordered by sortOrder.
 */
export async function GET(req: Request) {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try {
    const { searchParams } = new URL(req.url);
    const setId = searchParams.get("setId");
    if (!setId) return NextResponse.json({ error: "setId is required" }, { status: 400 });

    const questions = await prisma.mCQQuestion.findMany({
      where: { setId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: 500,
    });
    return NextResponse.json({ questions });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}

/**
 * POST /api/admin/questions
 * Supports:
 *  - single insert: { setId, prompt, type?, choices?, correctIndex?, data?, explanation?, difficulty?, tags? }
 *  - bulk insert:   { setId, questions: [ {...} ] }
 */
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
      if (incoming.length === 0) return NextResponse.json({ inserted: 0 });
      const data = incoming.map((q: any) => ({ setId, ...toDbQuestionPayload(q, typeof q.sortOrder === "number" ? q.sortOrder : nextOrder++) }));
      const res = await prisma.mCQQuestion.createMany({ data });
      return NextResponse.json({ inserted: res.count });
    }

    const payload = toDbQuestionPayload(body, typeof body.sortOrder === "number" ? body.sortOrder : nextOrder);
    const q = await prisma.mCQQuestion.create({ data: { setId, ...payload } });
    return NextResponse.json({ question: q });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/questions
 * Body:
 *  - { setId, order: [questionId1, questionId2, ...] } // reorders
 */
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
      if (Array.isArray(body.tags)) updateData.tags = body.tags.map((v: any) => String(v).trim()).filter(Boolean);
      if (body.testNowEligible !== undefined) updateData.testNowEligible = Boolean(body.testNowEligible);
      if (body.isGoldenEligible !== undefined) updateData.isGoldenEligible = Boolean(body.isGoldenEligible);
      if (body.goldenWeight !== undefined) updateData.goldenWeight = Math.max(1, Number(body.goldenWeight) || 1);
      if (body.goldenBonusXp !== undefined) updateData.goldenBonusXp = Math.max(0, Number(body.goldenBonusXp) || 0);
      const question = await prisma.mCQQuestion.update({ where: { id }, data: updateData });
      return NextResponse.json({ ok: true, question });
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
