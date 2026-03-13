import fs from "node:fs";
import path from "node:path";
import { validateGeneratedPayload } from "./contentEngineCommon.mjs";

function main() {
  const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve("scripts/content/generatedQuestions.json");
  const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const parsed = validateGeneratedPayload(raw);
  const totalQuestions = parsed.groups.reduce((sum, group) => sum + group.questions.length, 0);
  console.log(`Validated ${totalQuestions} questions across ${parsed.groups.length} groups.`);
}

main();
