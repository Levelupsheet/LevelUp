import { NextResponse } from "next/server";
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

    return NextResponse.json({ error: "Unsupported PATCH body" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
