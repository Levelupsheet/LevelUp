import { learnerEligible } from "./contentPipeline";
/** Only active placements of published sets define learner availability. */
export const LEGACY_TRAINING_PATHS: Record<string, { industry: string; careerPath: string }> = {
  HELPDESK_SUPPORT: { industry: "Information Technology", careerPath: "Help Desk" },
  DESKTOP_TECHNICIAN: { industry: "Information Technology", careerPath: "Desktop Technician" },
  CLOUD_ENGINEER: { industry: "Information Technology", careerPath: "Cloud Engineer" },
};
export type ContentPool = {
  key: string; lane: string; label: string; industry: string | null;
  careerPath: string | null; startingPosition: string | null; certExam: string | null;
  domain: string | null; questionCount: number; poolCount: number; setIds: string[];
};
export function canonicalTrainingTarget(args: { careerPath?: string | null; industry?: string | null; startingPosition?: string | null }) {
  const legacy = LEGACY_TRAINING_PATHS[String(args.startingPosition || "")];
  const careerPath = String(args.careerPath || legacy?.careerPath || "").trim() || null;
  return { industry: careerPath ? String(args.industry || legacy?.industry || "Other").trim() : null,
    careerPath, startingPosition: careerPath ? null : args.startingPosition || null };
}
export function trainingPlacementFilter(args: { careerPath?: string | null; industry?: string | null; startingPosition?: string | null }) {
  if (!args.careerPath && LEGACY_TRAINING_PATHS[String(args.startingPosition || "")]) {
    return trainingPlacementFilter(canonicalTrainingTarget(args));
  }
  if (!args.careerPath) return { startingPosition: args.startingPosition || null, careerPath: null };
  const explicit = { careerPath: args.careerPath, ...(args.industry ? { industry: args.industry } : {}) };
  const legacy = Object.entries(LEGACY_TRAINING_PATHS).filter(([, path]) =>
    path.careerPath.toLowerCase() === args.careerPath!.toLowerCase() &&
    (!args.industry || path.industry.toLowerCase() === args.industry.toLowerCase())
  ).map(([startingPosition]) => ({ startingPosition, careerPath: null }));
  return legacy.length ? { OR: [explicit, ...legacy] } : explicit;
}
export function buildContentPoolCatalog(placements: any[]): ContentPool[] {
  const groups = new Map<string, ContentPool>();
  for (const p of placements) {
    if (!p.isActive || !p.set || p.set.status !== "PUBLISHED") continue;
    const legacy = LEGACY_TRAINING_PATHS[String(p.startingPosition || "")];
    const industry = p.lane === "TRAINING" ? String(p.industry || legacy?.industry || "Other") : null;
    const careerPath = p.lane === "TRAINING" ? String(p.careerPath || legacy?.careerPath || p.startingPosition || "") : null;
    const certExam = p.certExam || null;
    const domain = String(p.set.domain || "GENERAL").toUpperCase();
    const key = p.lane === "TRAINING" ? `${p.lane}:${industry}:${careerPath}` : p.lane === "CERTIFICATIONS" ? `${p.lane}:${certExam}` : `${p.lane}:${domain}`;
    if ((p.lane === "TRAINING" && !careerPath) || (p.lane === "CERTIFICATIONS" && !certExam)) continue;
    const questionCount = Array.isArray(p.set.questions) ? p.set.questions.filter(learnerEligible).length : Number(p.set._count?.questions || 0);
    if (!questionCount) continue;
    const group = groups.get(key) || {
      key, lane: p.lane, label: careerPath || String(certExam || domain).replaceAll("_", " "),
      industry, careerPath, startingPosition: p.startingPosition || null, certExam,
      domain: p.lane === "TEST_NOW" ? domain : null, questionCount: 0, poolCount: 0, setIds: [],
    };
    // Duplicate legacy placements must not inflate the visible bank size.
    if (!group.setIds.includes(p.setId)) {
      group.setIds.push(p.setId);
      group.poolCount += 1;
      group.questionCount += questionCount;
    }
    groups.set(key, group);
  }
  return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label));
}
export function testNowBanks(pools: ContentPool[]) {
  const banks = pools.filter(p => p.lane === "TEST_NOW" && p.questionCount > 0);
  return [
    { domain: "MIXED", label: "Mixed", questionCount: banks.reduce((sum, p) => sum + p.questionCount, 0), setCount: banks.reduce((sum, p) => sum + p.poolCount, 0), mixed: true },
    ...banks.map(p => ({ domain: p.domain!, label: p.label, questionCount: p.questionCount, setCount: p.poolCount, mixed: false })),
  ];
}
