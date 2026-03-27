
import fs from "fs";
import path from "path";

export type Stage12Profile = {
  userId: string;
  analyzedAt: string;
  basics: { name: string; email: string; phone: string };
  headline: string;
  targetRole: string;
  skills: string[];
  certifications: string[];
  inferredDomains: { domain: string; score: number }[];
  strengths: string[];
  gaps: string[];
  recommendations: string[];
  coaching: {
    summary: string;
    strengths: string[];
    focusAreas: string[];
    nextActions: string[];
    behaviorNotes: string[];
  };
};

const FILE = path.join(process.cwd(), "data", "stage12-profiles.json");

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  AZURE: ["azure", "entra", "intune", "conditional access", "m365", "microsoft 365", "office 365", "azure ad", "az "],
  AWS: ["aws", "iam", "ec2", "s3", "cloudwatch", "lambda", "vpc", "rds"],
  NETWORKING: ["dns", "dhcp", "tcp", "udp", "subnet", "routing", "switch", "firewall", "https", "ssh", "vpn"],
  SECURITY: ["mfa", "siem", "edr", "xdr", "sentinel", "identity protection", "defender", "bitlocker", "phishing"],
  HELPDESK: ["ticket", "help desk", "troubleshoot", "printer", "outlook", "desktop support", "active directory", "group policy"],
  POWERSHELL: ["powershell", "pwsh", "script", "cmdlet"],
  LINUX: ["linux", "bash", "ubuntu", "red hat", "shell"],
};

const CERT_KEYWORDS = [
  "security+",
  "a+",
  "network+",
  "az-900",
  "az-104",
  "ms-102",
  "sc-900",
  "aws cloud practitioner",
  "solutions architect",
  "terraform associate",
];

function normalizeText(v: unknown) {
  return String(v || "").trim();
}

function dedupe(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value.trim());
  }
  return out;
}

function readStore(): Record<string, Stage12Profile> {
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(map: Record<string, Stage12Profile>) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(map, null, 2));
}

export function getStage12Profile(userId: string) {
  const key = normalizeText(userId);
  return key ? readStore()[key] || null : null;
}

export function saveStage12Profile(profile: Stage12Profile) {
  const map = readStore();
  map[profile.userId] = profile;
  writeStore(map);
  return profile;
}

function keywordScores(skills: string[], textBlob: string) {
  const haystack = `${skills.join(" | ")} | ${textBlob}`.toLowerCase();
  const rows = Object.entries(DOMAIN_KEYWORDS).map(([domain, words]) => {
    let score = 0;
    for (const word of words) {
      if (haystack.includes(word.toLowerCase())) score += 1;
    }
    return { domain, score };
  }).filter((row) => row.score > 0);
  return rows.sort((a, b) => b.score - a.score);
}

function inferTargetRole(skills: string[], domains: { domain: string; score: number }[]) {
  const joined = skills.join(" ").toLowerCase();
  if (joined.includes("help desk") || joined.includes("desktop support")) return "Helpdesk / Desktop Support";
  if (domains.find((d) => d.domain === "AZURE" || d.domain === "AWS")) return "Cloud Administrator / Cloud Engineer";
  if (domains.find((d) => d.domain === "NETWORKING")) return "Network / Systems Support";
  if (domains.find((d) => d.domain === "SECURITY")) return "Security Operations / Identity";
  return "IT Support / Cloud Operations";
}

function inferCertifications(skills: string[], textBlob: string) {
  const haystack = `${skills.join(" | ")} | ${textBlob}`.toLowerCase();
  return dedupe(CERT_KEYWORDS.filter((cert) => haystack.includes(cert)).map((cert) => cert.toUpperCase()));
}

function buildGaps(domains: { domain: string; score: number }[], masteryRows: { domain: string; xp: number }[]) {
  const masteryMap = new Map(masteryRows.map((row) => [String(row.domain).toUpperCase(), Number(row.xp || 0)]));
  const primary = domains.slice(0, 3).map((d) => d.domain);
  const gaps: string[] = [];
  for (const domain of primary) {
    if ((masteryMap.get(domain) || 0) < 200) gaps.push(`${domain} mastery needs more reps inside LevelUp Pro`);
  }
  if (!primary.includes("POWERSHELL")) gaps.push("PowerShell / CLI practice would strengthen hands-on admin readiness");
  if (!primary.includes("SECURITY")) gaps.push("Security signaling and identity defense topics should stay in rotation");
  return dedupe(gaps).slice(0, 5);
}

export function deriveStage12Profile(input: {
  userId: string;
  parsedJson: any;
  userXp?: number;
  masteryRows?: { domain: string; xp: number }[];
}) {
  const userId = normalizeText(input.userId);
  const parsed = input.parsedJson || {};
  const basics = {
    name: normalizeText(parsed?.basics?.name),
    email: normalizeText(parsed?.basics?.email),
    phone: normalizeText(parsed?.basics?.phone),
  };
  const headline = normalizeText(parsed?.headline || parsed?.note || "");
  const rawSkills = Array.isArray(parsed?.skills) ? parsed.skills.map((v: any) => normalizeText(v)).filter(Boolean) : [];
  const keywords = Array.isArray(parsed?.keywords) ? parsed.keywords.map((v: any) => normalizeText(v)).filter(Boolean) : [];
  const textBlob = [headline, ...(Array.isArray(parsed?.experience) ? parsed.experience.map((v: any) => normalizeText(v)) : []), ...(Array.isArray(parsed?.education) ? parsed.education.map((v: any) => normalizeText(v)) : []), ...keywords].join(" | ");
  const skills = dedupe([...rawSkills, ...keywords]).slice(0, 24);
  const inferredDomains = keywordScores(skills, textBlob).slice(0, 5);
  const certifications = inferCertifications(skills, textBlob);
  const targetRole = inferTargetRole(skills, inferredDomains);
  const masteryRows = Array.isArray(input.masteryRows) ? input.masteryRows : [];
  const gaps = buildGaps(inferredDomains, masteryRows);
  const strengths = dedupe([
    ...(inferredDomains[0] ? [`Resume shows the strongest signal in ${inferredDomains[0].domain}`] : []),
    ...(skills.slice(0, 3).map((skill) => `Skill detected: ${skill}`)),
    ...(certifications.slice(0, 2).map((cert) => `Certification signal: ${cert}`)),
  ]).slice(0, 4);

  const lowMasteryDomains = masteryRows
    .filter((row) => Number(row.xp || 0) < 150)
    .sort((a, b) => Number(a.xp || 0) - Number(b.xp || 0))
    .slice(0, 2)
    .map((row) => String(row.domain).toUpperCase());

  const focusAreas = dedupe([
    ...gaps.map((g) => g.replace(/ mastery needs more reps inside LevelUp Pro/i, "")),
    ...lowMasteryDomains,
  ]).slice(0, 4);

  const nextActions = dedupe([
    `Run a Test Now session focused on ${focusAreas[0] || inferredDomains[0]?.domain || "your weakest domain"}`,
    "Complete a mock tech interview after two more successful sessions",
    "Use certifications mode to reinforce missing concepts found in the resume gap scan",
  ]).slice(0, 3);

  const behaviorNotes = [
    input.userXp && input.userXp >= 5000
      ? "Current XP suggests you are ready for deeper timed interview practice."
      : "Build one more layer of consistency before relying on speed-heavy interview sessions.",
    focusAreas.length
      ? `Biggest growth opportunity right now: ${focusAreas.join(", ")}.`
      : "You have a balanced starting profile; continue mixing cloud, security, and troubleshooting reps.",
  ];

  const coachingSummary = strengths.length
    ? `Your resume aligns best with ${targetRole}. Strongest detected signals: ${strengths.slice(0, 2).join(" • ")}.`
    : `Your resume was parsed successfully. Continue building measurable strength inside LevelUp Pro to sharpen interview readiness.`;

  return {
    userId,
    analyzedAt: new Date().toISOString(),
    basics,
    headline,
    targetRole,
    skills,
    certifications,
    inferredDomains,
    strengths,
    gaps,
    recommendations: nextActions,
    coaching: {
      summary: coachingSummary,
      strengths,
      focusAreas,
      nextActions,
      behaviorNotes,
    },
  } satisfies Stage12Profile;
}
