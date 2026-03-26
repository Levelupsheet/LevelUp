import { getAdaptiveLearningContext } from "@/lib/adaptiveEngine";
import { gradeAnswer, type AnswerScore } from "@/app/api/_lib/scoring";

export type InterviewKind = "HR" | "TECH";

type InterviewFocus = {
  domain: string;
  label: string;
  weak: boolean;
};

export type InterviewQuestionPlanItem = {
  index: number;
  focus: string;
  label: string;
  prompt: string;
  rubric: string[];
  kind: InterviewKind;
};

const TECH_PROMPTS: Record<string, { label: string; prompts: string[]; rubric: string[] }> = {
  networking: {
    label: "Networking",
    prompts: [
      "A user reports they cannot reach the internet from one workstation. Walk me through the exact troubleshooting path you would take from the NIC outward.",
      "DNS appears intermittent for one office. How would you isolate whether the issue is client-side, DHCP, DNS, or upstream routing?",
      "Users can ping an IP but not browse to a hostname. Explain your triage steps and what tools you would use first.",
    ],
    rubric: ["layered troubleshooting", "validation steps", "clear escalation criteria"],
  },
  identity: {
    label: "Identity",
    prompts: [
      "A user is locked out after repeated MFA failures. How do you verify the cause and restore secure access without weakening policy?",
      "A mapped drive works for one group but not another. Explain how you would check identity, group membership, and permissions end to end.",
      "Walk through how you would troubleshoot a sign-in issue involving conditional access, stale tokens, or incorrect group assignment.",
    ],
    rubric: ["access path reasoning", "security awareness", "least-privilege mindset"],
  },
  security: {
    label: "Security",
    prompts: [
      "A user clicked a suspicious email attachment. What are your first five response steps and what would you document?",
      "How would you distinguish between a policy block, malware symptom, and normal application issue during triage?",
      "Describe how you would handle a phishing report while balancing speed, containment, and user communication.",
    ],
    rubric: ["containment", "documentation", "communication"],
  },
  aws: {
    label: "AWS",
    prompts: [
      "An EC2-hosted application is timing out. Explain how you would narrow the issue across security groups, NACLs, route tables, and the instance itself.",
      "A role-based app lost S3 access after a change. Walk through your IAM troubleshooting sequence.",
      "CloudWatch shows elevated errors after a deployment. How would you investigate and reduce blast radius?",
    ],
    rubric: ["cloud networking", "IAM reasoning", "observability"],
  },
  azure: {
    label: "Azure",
    prompts: [
      "A user cannot access a Microsoft 365 resource after a conditional access update. How would you troubleshoot it in Entra and Azure?",
      "A VM is healthy but users cannot reach the service. Explain how you would validate NSGs, routes, DNS, and the guest OS.",
      "Describe how you would troubleshoot a privilege issue involving Entra roles or PIM activation.",
    ],
    rubric: ["identity flow", "network validation", "privileged access controls"],
  },
  windows: {
    label: "Windows",
    prompts: [
      "A Windows endpoint is slow after login for multiple users. What do you check first and how do you isolate cause versus symptom?",
      "A printer is offline for an entire department. Walk through your troubleshooting from client to spooler to print server.",
      "Explain your process for diagnosing profile corruption versus GPO or software conflict on a workstation.",
    ],
    rubric: ["step-by-step reasoning", "tool selection", "root-cause discipline"],
  },
  general: {
    label: "General IT",
    prompts: [
      "A user reports a vague issue with slow systems and intermittent application errors. How do you structure your troubleshooting from the first minute?",
      "Walk me through how you gather facts, reduce scope, and decide when to escalate in a real support incident.",
    ],
    rubric: ["structured troubleshooting", "clarifying questions", "ownership"],
  },
};

const HR_PROMPTS: Record<string, { label: string; prompts: string[]; rubric: string[] }> = {
  communication: {
    label: "Communication",
    prompts: [
      "Tell me about a time you had to explain a technical problem to a frustrated non-technical user. What did you say and how did it end?",
      "Describe a time you had to communicate clearly during a service interruption or urgent issue.",
    ],
    rubric: ["clarity", "empathy", "ownership"],
  },
  prioritization: {
    label: "Prioritization",
    prompts: [
      "You have three urgent tickets, one VIP request, and a manager asking for updates. How do you prioritize and communicate your plan?",
      "Describe a real time you had competing priorities. What framework did you use and what was the outcome?",
    ],
    rubric: ["triage judgement", "communication", "time management"],
  },
  teamwork: {
    label: "Teamwork",
    prompts: [
      "Tell me about a time you needed help from another team to solve an issue. How did you collaborate without losing ownership?",
      "Describe a situation where you disagreed with a teammate or escalation path. How did you handle it?",
    ],
    rubric: ["collaboration", "professionalism", "follow-through"],
  },
  growth: {
    label: "Growth",
    prompts: [
      "Tell me about a technical skill gap you discovered in yourself and how you closed it.",
      "Why are you a strong fit for a role that mixes troubleshooting, customer service, and continuous learning?",
    ],
    rubric: ["self-awareness", "learning mindset", "specificity"],
  },
};

function clamp(n: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, n));
}

function titleCase(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\w/g, (m) => m.toUpperCase());
}

function detectFocus(answer: string) {
  const text = String(answer || "").toLowerCase();
  const keys = ["network", "dns", "tcp", "ip", "mfa", "entra", "iam", "azure", "aws", "printer", "windows", "security", "phish", "malware"];
  for (const key of keys) {
    if (text.includes(key)) {
      if (["network", "dns", "tcp", "ip"].includes(key)) return "networking";
      if (["mfa", "entra", "iam"].includes(key)) return key === "azure" ? "azure" : "identity";
      if (key === "azure") return "azure";
      if (key === "aws") return "aws";
      if (["printer", "windows"].includes(key)) return "windows";
      if (["security", "phish", "malware"].includes(key)) return "security";
    }
  }
  return "general";
}

function evaluateContentSignals(kind: InterviewKind, answer: string) {
  const text = String(answer || "").toLowerCase();
  const structureHits = ["first", "then", "next", "finally", "document", "escalate"].filter((k) => text.includes(k)).length;
  const troubleshootingHits = ["scope", "reproduce", "logs", "dns", "ping", "permissions", "policy", "service", "restart", "validate"].filter((k) => text.includes(k)).length;
  const hrHits = ["situation", "task", "action", "result", "customer", "communicate", "follow up", "team"].filter((k) => text.includes(k)).length;
  const ownershipHits = ["i would", "i did", "i owned", "i communicated", "i documented"].filter((k) => text.includes(k)).length;
  const riskHits = ["security", "least privilege", "mfa", "escalate", "contain", "verify"].filter((k) => text.includes(k)).length;

  const communication = clamp((structureHits + ownershipHits) / 8);
  const troubleshooting = clamp((troubleshootingHits + riskHits) / 10);
  const businessContext = clamp((hrHits + ownershipHits) / 8);

  if (kind === "TECH") {
    return { communication, troubleshooting, businessContext: clamp((riskHits + structureHits) / 8) };
  }
  return { communication: clamp((hrHits + ownershipHits) / 8), troubleshooting: clamp((structureHits + troubleshootingHits) / 10), businessContext };
}

export async function buildInterviewPlan(userId: string, kind: InterviewKind) {
  const ctx = await getAdaptiveLearningContext(userId).catch(() => null);
  const weakDomains = Object.entries(ctx?.masteryByDomain || {})
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .slice(0, 3)
    .map(([domain]) => domain || "general");

  const focuses: InterviewFocus[] = kind === "TECH"
    ? [
        ...weakDomains.map((domain) => ({ domain, label: titleCase(domain), weak: true })),
        { domain: "general", label: "General IT", weak: false },
      ]
    : [
        { domain: "communication", label: "Communication", weak: false },
        { domain: "prioritization", label: "Prioritization", weak: false },
        { domain: "teamwork", label: "Teamwork", weak: false },
        { domain: "growth", label: "Growth", weak: false },
      ];

  const unique = focuses.filter((focus, idx) => focuses.findIndex((f) => f.domain === focus.domain) === idx).slice(0, 5);
  return unique.map((focus, index) => {
    const bank = kind === "TECH" ? (TECH_PROMPTS[focus.domain] || TECH_PROMPTS.general) : (HR_PROMPTS[focus.domain] || HR_PROMPTS.communication);
    const prompt = bank.prompts[index % bank.prompts.length] || bank.prompts[0];
    return { index, focus: focus.domain, label: bank.label, prompt, rubric: bank.rubric, kind } satisfies InterviewQuestionPlanItem;
  });
}

export function evaluateInterviewAnswerDetailed(input: { kind: InterviewKind; answer: string; focus?: string | null; turnIndex?: number }) {
  const base: AnswerScore = gradeAnswer({ tier: input.kind === "TECH" ? 3 : 2, answerText: input.answer });
  const signals = evaluateContentSignals(input.kind, input.answer);
  const focus = String(input.focus || detectFocus(input.answer));
  const technicalDepth = input.kind === "TECH" ? clamp((signals.troubleshooting * 0.6) + (signals.businessContext * 0.4)) : clamp((signals.businessContext * 0.55) + (signals.communication * 0.45));
  const finalScore = clamp((base.total * 0.55) + (signals.communication * 0.15) + (signals.troubleshooting * 0.2) + (signals.businessContext * 0.1));
  const strengths: string[] = [];
  const improvements: string[] = [];
  if (signals.communication >= 0.55) strengths.push("clear communication"); else improvements.push("make your answer more structured and easier to follow");
  if (signals.troubleshooting >= 0.5) strengths.push(input.kind === "TECH" ? "solid troubleshooting flow" : "good logical sequencing"); else improvements.push(input.kind === "TECH" ? "show a more methodical troubleshooting path" : "add more concrete actions and results");
  if (signals.businessContext >= 0.45) strengths.push(input.kind === "TECH" ? "good risk and escalation awareness" : "good customer and team awareness"); else improvements.push(input.kind === "TECH" ? "mention validation, documentation, and escalation points" : "connect your example to business impact and teamwork");
  if (String(input.answer || "").length < 120) improvements.push("add more depth and specific examples");
  const coach = improvements[0] || "Keep the same structure and add one specific example or validation step.";
  return {
    ...base,
    total: Number(finalScore.toFixed(3)),
    focus,
    technicalDepth: Number(technicalDepth.toFixed(3)),
    strengths,
    improvements,
    coach,
    signals,
    readinessBand: finalScore >= 0.8 ? "STRONG" : finalScore >= 0.67 ? "ON_TRACK" : finalScore >= 0.52 ? "DEVELOPING" : "AT_RISK",
  };
}

export function generateInterviewerReply(input: { kind: InterviewKind; focus?: string | null; score: ReturnType<typeof evaluateInterviewAnswerDetailed>; nextQuestion?: string | null; }) {
  const score = input.score;
  const lead = score.total >= 0.78
    ? "Good answer."
    : score.total >= 0.6
      ? "That is a workable answer."
      : "I see the direction, but I need more depth.";
  const strength = score.strengths[0] ? ` Your strongest signal was ${score.strengths[0]}.` : "";
  const improvement = score.improvements[0] ? ` Next time, ${score.improvements[0]}.` : "";
  const follow = input.nextQuestion ? ` Next question: ${input.nextQuestion}` : "";
  return `${lead}${strength}${improvement}${follow}`.trim();
}

export function summarizeInterviewPerformance(input: { kind: InterviewKind; turns: Array<{ scoreTotal?: number | null; breakdownJson?: any; content?: string | null }>; }) {
  const scores = input.turns.map((t) => Number(t.scoreTotal || t?.breakdownJson?.total || 0)).filter((n) => Number.isFinite(n));
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const weaknessCounts = new Map<string, number>();
  const strengths = new Set<string>();
  for (const turn of input.turns) {
    const breakdown = turn?.breakdownJson || {};
    for (const item of Array.isArray(breakdown?.strengths) ? breakdown.strengths : []) strengths.add(String(item));
    for (const item of Array.isArray(breakdown?.improvements) ? breakdown.improvements : []) weaknessCounts.set(String(item), (weaknessCounts.get(String(item)) || 0) + 1);
  }
  const topGaps = [...weaknessCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([gap]) => gap);
  const summary = avg >= 0.78
    ? `Strong ${input.kind.toLowerCase()} interview performance with consistent structure and coaching-ready detail.`
    : avg >= 0.62
      ? `Solid baseline ${input.kind.toLowerCase()} interview performance with a few targeted gaps to improve.`
      : `${input.kind} interview performance is still developing and needs more structure, depth, and specificity.`;
  return {
    avg: Number(avg.toFixed(3)),
    summary,
    strengths: [...strengths].slice(0, 4),
    topGaps,
    readinessBand: avg >= 0.78 ? "STRONG" : avg >= 0.62 ? "ON_TRACK" : avg >= 0.5 ? "DEVELOPING" : "AT_RISK",
  };
}
