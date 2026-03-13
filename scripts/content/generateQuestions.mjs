import fs from "node:fs";
import path from "node:path";
import {
  validateGeneratedPayload,
  validateKnowledgeBlock,
  buildPromptFromFact,
  ensureQuestion,
  normalizeDomain,
  normalizeFact,
  shuffle,
  timerForDifficulty,
  uniqueStrings,
  xpForDifficulty,
} from "./contentEngineCommon.mjs";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeBaseQuestion(block, extra = {}) {
  return {
    difficulty: block.difficulty,
    explanation: null,
    tags: uniqueStrings([block.domain.toLowerCase(), ...(block.tags || []), ...(extra.tags || [])]),
    xp: xpForDifficulty(block.difficulty),
    timer: timerForDifficulty(block.difficulty),
  };
}

function stripRuntimeFields(question) {
  const { xp, timer, ...rest } = question;
  return rest;
}

function makeMcChoices(answer, distractors, desiredCount = 4) {
  const pool = uniqueStrings([answer, ...distractors]).filter(Boolean);
  const selected = pool.slice(0, Math.max(2, desiredCount));
  const shuffled = shuffle(selected);
  return {
    choices: shuffled,
    correctIndex: shuffled.findIndex((value) => value === answer),
  };
}

function generateFactQuestions(block) {
  const questions = [];

  for (const rawFact of block.facts) {
    const fact = normalizeFact(rawFact);
    if (!fact.statement || !fact.answer) continue;

    const base = makeBaseQuestion(block, { tags: fact.tags });
    const prompt = buildPromptFromFact(fact.statement, fact.questionHint);
    const distractors = uniqueStrings([
      ...fact.distractors,
      ...block.distractors,
      ...(fact.answer ? [`Not ${fact.answer}`] : []),
      "None of the above",
      "All of the above",
    ]).filter((value) => value !== fact.answer);

    const { choices, correctIndex } = makeMcChoices(fact.answer, distractors, 4);
    if (choices.length >= 2 && correctIndex >= 0) {
      questions.push(
        ensureQuestion(
          stripRuntimeFields({
            ...base,
            prompt,
            type: "multiple_choice",
            explanation: fact.statement,
            choices,
            correctIndex,
            data: {
              sourceStatement: fact.statement,
              choices,
              correctIndex,
              xp: base.xp,
              timer: base.timer,
            },
          })
        )
      );
    }

    questions.push(
      ensureQuestion(
        stripRuntimeFields({
          ...base,
          prompt: `${fact.statement.replace(fact.answer, "____")}`,
          type: "fill_blank",
          explanation: fact.statement,
          data: {
            answers: uniqueStrings([fact.answer, ...(fact.synonyms || [])]),
            placeholder: "Type your answer",
            caseSensitive: false,
            xp: base.xp,
            timer: base.timer,
          },
        })
      )
    );
  }

  return questions;
}

function generateDefinitionQuestions(block) {
  const questions = [];

  for (const definition of block.definitions) {
    const base = makeBaseQuestion(block, { tags: [definition.term] });
    const answer = definition.term;
    const distractors = uniqueStrings([
      ...definition.distractors,
      ...block.definitions.filter((d) => d.term !== definition.term).map((d) => d.term),
      ...block.distractors,
    ]).filter((value) => value !== answer);
    const { choices, correctIndex } = makeMcChoices(answer, distractors, 4);

    if (choices.length >= 2 && correctIndex >= 0) {
      questions.push(
        ensureQuestion(
          stripRuntimeFields({
            ...base,
            prompt: `Which term best matches this definition: ${definition.definition}`,
            type: "multiple_choice",
            explanation: `${definition.term}: ${definition.definition}`,
            choices,
            correctIndex,
            data: {
              sourceDefinition: definition.definition,
              choices,
              correctIndex,
              xp: base.xp,
              timer: base.timer,
            },
          })
        )
      );
    }

    questions.push(
      ensureQuestion(
        stripRuntimeFields({
          ...base,
          prompt: `${definition.definition} Fill in the missing term.` ,
          type: "fill_blank",
          explanation: `${definition.term}: ${definition.definition}`,
          data: {
            answers: uniqueStrings([definition.term, ...(definition.aliases || [])]),
            placeholder: "Type the term",
            caseSensitive: false,
            xp: base.xp,
            timer: base.timer,
          },
        })
      )
    );
  }

  return questions;
}

function generateProcedureQuestions(block) {
  const questions = [];

  for (const procedure of block.procedures) {
    const base = makeBaseQuestion({ ...block, difficulty: Math.max(block.difficulty, 2) }, { tags: [procedure.title] });
    const shuffledSteps = shuffle(procedure.steps);

    questions.push(
      ensureQuestion(
        stripRuntimeFields({
          ...base,
          prompt: `Put the steps in the correct order for: ${procedure.title}`,
          type: "sequence_order",
          explanation: procedure.outcome || procedure.steps.join(" -> "),
          data: {
            items: shuffledSteps,
            correctOrder: procedure.steps,
            instructions: "Drag or move each step into the correct sequence.",
            xp: base.xp,
            timer: base.timer,
          },
        })
      )
    );

    if (procedure.steps.length >= 3) {
      const choices = procedure.steps.slice(0, 4);
      questions.push(
        ensureQuestion(
          stripRuntimeFields({
            ...base,
            prompt: `Select all steps that belong to the procedure: ${procedure.title}`,
            type: "multi_select",
            explanation: procedure.outcome || procedure.steps.join(" -> "),
            choices,
            data: {
              choices,
              correctIndices: choices.map((_, index) => index),
              minSelections: Math.min(2, choices.length),
              maxSelections: choices.length,
              xp: base.xp,
              timer: base.timer,
            },
          })
        )
      );
    }
  }

  return questions;
}

function generateCommandQuestions(block) {
  const questions = [];

  for (const command of block.commands) {
    const base = makeBaseQuestion(block, { tags: [command.platform || "cli", ...(command.tags || [])] });
    const expectedCommands = uniqueStrings([command.command, ...(command.aliases || [])]);

    questions.push(
      ensureQuestion(
        stripRuntimeFields({
          ...base,
          prompt: `Enter the command to: ${command.purpose}`,
          type: "cli_command",
          explanation: `Expected command: ${command.command}`,
          data: {
            expectedCommands,
            placeholder: command.platform ? `Type ${command.platform} command` : "Type command here",
            hint: command.platform ? `Platform: ${command.platform}` : undefined,
            allowContains: true,
            xp: base.xp,
            timer: base.timer,
          },
        })
      )
    );
  }

  return questions;
}

function generateScenarioQuestions(block) {
  const questions = [];

  for (const scenario of block.scenarios) {
    const difficulty = scenario.severity === "high" ? Math.max(block.difficulty, 3) : Math.max(block.difficulty, 2);
    const base = makeBaseQuestion({ ...block, difficulty }, { tags: scenario.tags });
    const distractors = uniqueStrings([
      ...(scenario.distractors || []),
      "Ignore the issue and monitor later.",
      "Restart the user device only and close the ticket.",
      "Escalate without gathering any facts.",
    ]).filter((value) => value !== scenario.bestAction);
    const { choices, correctIndex } = makeMcChoices(scenario.bestAction, distractors, 4);

    questions.push(
      ensureQuestion(
        stripRuntimeFields({
          ...base,
          prompt: "What is the best next action?",
          type: "incident",
          explanation: scenario.bestAction,
          choices,
          correctIndex,
          data: {
            scenario: scenario.scenario,
            choices,
            correctIndex,
            severity: scenario.severity || "medium",
            xp: base.xp,
            timer: base.timer,
          },
        })
      )
    );
  }

  return questions;
}

function generateKnowledgeBlock(block) {
  const parsed = validateKnowledgeBlock(block);
  return {
    blockId: parsed.id,
    set: {
      name: parsed.setName,
      domain: normalizeDomain(parsed.domain),
      lane: parsed.lane,
      startingPosition: parsed.startingPosition,
      certExam: parsed.certExam,
      stage: parsed.stage,
      difficulty: parsed.difficulty,
      source: parsed.source,
    },
    questions: [
      ...generateFactQuestions(parsed),
      ...generateDefinitionQuestions(parsed),
      ...generateProcedureQuestions(parsed),
      ...generateCommandQuestions(parsed),
      ...generateScenarioQuestions(parsed),
    ],
  };
}

function main() {
  const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve("scripts/content/sampleKnowledgeBlocks.json");
  const outputPath = process.argv[3] ? path.resolve(process.argv[3]) : path.resolve("scripts/content/generatedQuestions.json");
  const raw = readJson(inputPath);
  const blocks = Array.isArray(raw) ? raw : Array.isArray(raw.blocks) ? raw.blocks : [];

  if (!blocks.length) {
    throw new Error("No knowledge blocks found in input JSON.");
  }

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    groups: blocks.map(generateKnowledgeBlock).filter((group) => group.questions.length > 0),
  };

  validateGeneratedPayload(payload);
  writeJson(outputPath, payload);

  const totalQuestions = payload.groups.reduce((sum, group) => sum + group.questions.length, 0);
  console.log(`Generated ${totalQuestions} questions across ${payload.groups.length} groups -> ${outputPath}`);
}

main();
