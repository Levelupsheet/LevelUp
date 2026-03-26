import { normalizeQuestionType } from "@/lib/questionTypes";

function arr(value: any) {
  return Array.isArray(value) ? value : [];
}

function inferConcepts(question: any) {
  const text = `${question?.prompt || ""} ${question?.domainId || ""} ${question?.subdomain || ""}`.toLowerCase();
  const concepts = [] as string[];
  if (text.includes("dns")) concepts.push("DNS resolution");
  if (text.includes("mfa")) concepts.push("MFA flow");
  if (text.includes("printer")) concepts.push("print services");
  if (text.includes("iam")) concepts.push("IAM permissions");
  if (text.includes("security")) concepts.push("security controls");
  if (!concepts.length && question?.subdomain) concepts.push(String(question.subdomain));
  if (!concepts.length && question?.domainId) concepts.push(String(question.domainId));
  return concepts;
}

export function buildQuestionExplanation(input: { question: any; userAnswer?: any; evaluation?: any }) {
  const q = input.question || {};
  const evaln = input.evaluation || {};
  const type = String(normalizeQuestionType(q?.type || "multiple_choice") || "multiple_choice");
  const concepts = inferConcepts(q);
  const choices = arr(q?.choices || q?.data?.choices);
  const correctIndex = typeof q?.correctIndex === 'number' ? q.correctIndex : (typeof q?.data?.correctIndex === 'number' ? q.data.correctIndex : null);
  const correctChoice = correctIndex != null ? choices[correctIndex] : q?.data?.answer ?? q?.data?.correctAnswer ?? null;
  const userAnswer = input.userAnswer;
  const partialScore = Number(evaln?.partialScore ?? evaln?.score ?? (evaln?.correct ? 1 : 0) ?? 0);
  const status = evaln?.correct ? 'correct' : partialScore > 0 ? 'partial' : 'incorrect';
  const whyCorrect = q?.explanation || `The best answer aligns with the core concept being tested: ${concepts.join(', ') || 'the underlying technical objective'}.`;
  let whyUser = '';
  if (status === 'correct') {
    whyUser = 'Your response matched the expected action or concept closely enough to earn full credit.';
  } else if (status === 'partial') {
    whyUser = 'Your response showed partial understanding, but it missed one or more required details for full credit.';
  } else {
    whyUser = 'Your response did not line up with the expected troubleshooting step, concept, or correct choice.';
  }
  const remediation = type === 'cli_command'
    ? 'Practice the command intent first, then add exact flags or syntax.'
    : type === 'log_analysis'
      ? 'Read the log for the failure source, then identify the next validation step.'
      : type === 'sequence'
        ? 'Break the task into ordered phases: identify, validate, fix, confirm.'
        : 'Review the concept, then explain why the correct answer works better than the distractors.';
  const nextStep = concepts[0] ? `Spend 3–5 more questions on ${concepts[0]} before moving back to mixed difficulty.` : 'Do 3 quick remediation questions before resuming mixed practice.';
  return {
    status,
    partialScore: Number(partialScore.toFixed(3)),
    correctAnswer: correctChoice,
    concepts,
    whyCorrect,
    whyUser,
    remediation,
    nextStep,
    coachingTip: q?.data?.subdomain ? `Focus on ${String(q.data.subdomain)} and explain your reasoning out loud.` : 'State your reasoning step by step before choosing an answer.',
  };
}
