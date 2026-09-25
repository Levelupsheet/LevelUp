import { normalizeQuestionType, normalizeText, safeArray, uniqueSortedNumbers } from "@/lib/questionTypes";

export function promptSignature(input: { prompt?: string | null; type?: string | null; subdomain?: string | null; choices?: any[] | null; data?: any }) {
  const prompt = normalizeText(String(input.prompt || "")).replace(/\s+/g, " ");
  const type = String(normalizeQuestionType(input.type)).toLowerCase();
  const subdomain = normalizeText(String(input.subdomain || input.data?.subdomain || "general"));
  const choices = safeArray<string>(input.choices || input.data?.choices).map((v) => normalizeText(String(v)));
  return JSON.stringify({ prompt, type, subdomain, choices });
}

export function estimatePromptSimilarity(a?: string | null, b?: string | null) {
  const aa = new Set(normalizeText(String(a || "")).split(" ").filter(Boolean));
  const bb = new Set(normalizeText(String(b || "")).split(" ").filter(Boolean));
  if (!aa.size || !bb.size) return 0;
  let overlap = 0;
  for (const token of aa) if (bb.has(token)) overlap += 1;
  return overlap / Math.max(aa.size, bb.size);
}

export function clusterQuestionsBySimilarity<T extends { id?: string; prompt?: string | null; type?: string | null }>(questions: T[], threshold = 0.84) {
  const clusters: Array<{ anchorId: string; ids: string[]; prompts: string[] }> = [];
  for (const q of questions || []) {
    const id = String(q.id || "");
    const prompt = String(q.prompt || "");
    if (!id || !prompt) continue;
    let placed = false;
    for (const cluster of clusters) {
      const anchorPrompt = cluster.prompts[0] || "";
      if (estimatePromptSimilarity(prompt, anchorPrompt) >= threshold) {
        cluster.ids.push(id);
        cluster.prompts.push(prompt);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ anchorId: id, ids: [id], prompts: [prompt] });
  }
  return clusters;
}

export function validateQuestionQuality(input: { prompt?: string | null; type?: string | null; choices?: any[] | null; correctIndex?: number | null; data?: any; explanation?: string | null }) {
  const issues: string[] = [];
  const type = normalizeQuestionType(input.type);
  const prompt = String(input.prompt || "").trim();
  const explanation = String(input.explanation || "").trim();
  const data = input.data && typeof input.data === "object" ? input.data : {};
  const choices = safeArray<string>(input.choices || data.choices);

  if (!prompt || prompt.length < 12) issues.push("Prompt is too short");
  if (!explanation) issues.push("Explanation missing");
  if (explanation && /^the correct answer is\b/i.test(explanation)) issues.push("Explanation should teach why the answer is correct");
  if (/\b(all of the above|none of the above)\b/i.test(choices.join(" "))) issues.push("Avoid all/none-of-the-above distractors");
  if (choices.length && choices.some((choice) => String(choice).trim().length < 1)) issues.push("Empty answer choice detected");
  if (/which answer is correct based on this fact|which option best matches this concept/i.test(prompt)) issues.push("Generic fact-recall wording should be rewritten");
  if (/^fill in the blank:/i.test(prompt)) issues.push("Fill-blank should be a natural sentence, not a definition prompt");

  if (type === "multiple_choice" || type === "incident") {
    if (choices.length < 4) issues.push("Needs at least 4 choices");
    const uniqueChoices = new Set(choices.map((v) => normalizeText(v)));
    const lengths = choices.map((v) => String(v).trim().length).filter(Boolean);
    if (lengths.length >= 4 && Math.max(...lengths) > Math.max(18, Math.min(...lengths) * 4)) issues.push("One answer choice is disproportionately long and may reveal the answer");
    if (uniqueChoices.size !== choices.length) issues.push("Duplicate answer choices detected");
    const correctIndex = Number(input.correctIndex ?? data.correctIndex ?? -1);
    if (correctIndex < 0 || correctIndex >= choices.length) issues.push("Correct index is invalid");
  }

  if (type === "fill_blank") {
    const answers = safeArray<string>(data.answers).map((v) => String(v).trim()).filter(Boolean);
    if (!/_{3,}/.test(prompt)) issues.push("Fill-blank prompt needs a visible blank inside the sentence");
    if (!answers.length) issues.push("Fill-blank needs at least one accepted answer");
    if (answers.some((answer) => answer.length > 80)) issues.push("Fill-blank answer is too long; use a focused term or value");
  }

  if (type === "multi_select") {
    const correctIndices = uniqueSortedNumbers(data.correctIndices);
    if (choices.length < 4) issues.push("Multi-select needs at least 4 choices");
    if (correctIndices.length < 2) issues.push("Multi-select needs at least 2 correct answers");
  }

  if (type === "cli_command") {
    const commands = safeArray<string>(data.expectedCommands).filter(Boolean);
    if (!commands.length) issues.push("CLI question missing expectedCommands");
    const distractors = safeArray<string>(data.distractors || data.wrongCommands).filter(Boolean);
    if (!distractors.length) issues.push("CLI question missing wrong command distractors");
  }

  if (type === "log_analysis") {
    const logText = String(data.logText || data.log || "").trim();
    const answers = safeArray<string>(data.answers || data.expectedFindings).filter(Boolean);
    if (!logText) issues.push("Log analysis missing log text");
    if (!answers.length) issues.push("Log analysis missing accepted findings");
  }

  const qualityScore = Math.max(0, Math.min(100, 100 - issues.length * 18 - (prompt.length < 24 ? 8 : 0) + (explanation ? 4 : 0)));
  return { issues, qualityScore };
}
