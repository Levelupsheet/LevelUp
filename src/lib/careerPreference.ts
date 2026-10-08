export type CareerTarget = { industry: string; careerPath: string };
export function normalizeCareerTarget(input: any): CareerTarget | null {
  const industry = String(input?.industry || "").trim();
  const careerPath = String(input?.careerPath || "").trim();
  return industry && careerPath && industry.length <= 160 && careerPath.length <= 160 ? {industry,careerPath} : null;
}
export function isPublishedCareer(target: CareerTarget, pools: any[]) {
  return pools.some(pool => pool.lane === "TRAINING" && pool.industry === target.industry && pool.careerPath === target.careerPath && pool.questionCount > 0);
}
