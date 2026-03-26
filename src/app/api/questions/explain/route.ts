import { NextResponse } from "next/server";
import { buildQuestionExplanation } from "@/lib/explanations";
import { evaluateQuestionAnswer } from "@/lib/questionTransforms";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const question = body?.question && typeof body.question === "object" ? body.question : null;
    if (!question) return NextResponse.json({ error: "question required" }, { status: 400 });
    const answer = body?.answer;
    const evaluation = evaluateQuestionAnswer({
      type: question?.type,
      prompt: question?.prompt,
      correctIndex: question?.correctIndex,
      choices: Array.isArray(question?.choices) ? question.choices : undefined,
      data: question?.data,
      answer,
    });
    const explanation = buildQuestionExplanation({ question, userAnswer: answer, evaluation });
    return NextResponse.json({ ok: true, evaluation, explanation });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to explain question" }, { status: 500 });
  }
}
