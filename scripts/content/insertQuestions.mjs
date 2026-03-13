import fs from "node:fs";
import path from "node:path";
import { PrismaClient, QuestionSetStatus } from "@prisma/client";
import { validateGeneratedPayload } from "./contentEngineCommon.mjs";

const prisma = new PrismaClient();

function normalizeDbQuestion(question, sortOrder) {
  const type = String(question.type || "multiple_choice").trim().toUpperCase();
  const base = {
    prompt: question.prompt,
    type,
    sortOrder,
    explanation: question.explanation ?? null,
    difficulty: Number(question.difficulty ?? 1) || 1,
    tags: Array.isArray(question.tags) ? question.tags : [],
    data: question.data ?? {},
  };

  if (type === "MULTIPLE_CHOICE" || type === "INCIDENT") {
    const choices = Array.isArray(question.choices)
      ? question.choices
      : Array.isArray(question?.data?.choices)
        ? question.data.choices
        : [];
    const correctIndex = typeof question.correctIndex === "number"
      ? question.correctIndex
      : Number(question?.data?.correctIndex ?? -1);
    return {
      ...base,
      choices,
      correctIndex: Number.isInteger(correctIndex) && correctIndex >= 0 ? correctIndex : null,
      data: {
        ...(question.data || {}),
        choices,
        correctIndex,
      },
    };
  }

  if (type === "MULTI_SELECT") {
    const choices = Array.isArray(question.choices)
      ? question.choices
      : Array.isArray(question?.data?.choices)
        ? question.data.choices
        : [];
    return {
      ...base,
      choices,
      correctIndex: null,
      data: {
        ...(question.data || {}),
        choices,
      },
    };
  }

  return {
    ...base,
    choices: null,
    correctIndex: null,
  };
}

async function upsertGroup(group) {
  const set = await prisma.questionSet.upsert({
    where: {
      id: `generated-${group.blockId}`,
    },
    update: {
      name: group.set.name,
      domain: group.set.domain,
      status: QuestionSetStatus.PUBLISHED,
    },
    create: {
      id: `generated-${group.blockId}`,
      name: group.set.name,
      domain: group.set.domain,
      status: QuestionSetStatus.PUBLISHED,
    },
  });

  await prisma.questionSetPlacement.upsert({
    where: {
      id: `generated-placement-${group.blockId}`,
    },
    update: {
      lane: group.set.lane,
      startingPosition: group.set.startingPosition ?? null,
      certExam: group.set.certExam ?? null,
      isActive: true,
    },
    create: {
      id: `generated-placement-${group.blockId}`,
      setId: set.id,
      lane: group.set.lane,
      startingPosition: group.set.startingPosition ?? null,
      certExam: group.set.certExam ?? null,
      isActive: true,
    },
  });

  await prisma.mCQQuestion.deleteMany({ where: { setId: set.id } });

  if (!group.questions.length) return { setId: set.id, inserted: 0 };

  const data = group.questions.map((question, index) => ({
    setId: set.id,
    ...normalizeDbQuestion(question, index),
  }));

  const result = await prisma.mCQQuestion.createMany({ data });
  return { setId: set.id, inserted: result.count };
}

async function main() {
  const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve("scripts/content/generatedQuestions.json");
  const payload = validateGeneratedPayload(JSON.parse(fs.readFileSync(inputPath, "utf8")));

  let totalInserted = 0;
  for (const group of payload.groups) {
    const result = await upsertGroup(group);
    totalInserted += result.inserted;
    console.log(`Inserted ${result.inserted} questions into set ${result.setId}`);
  }

  console.log(`Done. Inserted ${totalInserted} questions total.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
