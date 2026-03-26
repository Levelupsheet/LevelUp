import { getAdaptiveLearningContext } from "@/lib/adaptiveEngine";

function titleCase(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\w/g, (m) => m.toUpperCase());
}

function avg(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export async function buildPersonalizedLearningPath(userId: string) {
  const ctx = await getAdaptiveLearningContext(userId);
  const weakestDomains = Object.entries(ctx.masteryByDomain)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .slice(0, 3)
    .map(([domain, mastery]) => ({ domain, mastery: Number(mastery || 0) }));

  const subdomainWeakness = Object.entries(ctx.masteryBySubdomain)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .slice(0, 5)
    .map(([key, mastery]) => {
      const [domain, subdomain] = key.split(":");
      return { domain, subdomain, mastery: Number(mastery || 0) };
    });

  const typeWeakness = Object.entries(ctx.masteryByQuestionType)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .slice(0, 3)
    .map(([type, mastery]) => ({ type, mastery: Number(mastery || 0) }));

  const recentScores = ctx.recentHistory.slice(0, 15).map((row) => Number(row.score || 0));
  const trend = recentScores.length >= 6 ? avg(recentScores.slice(0, 5)) - avg(recentScores.slice(5, 10)) : 0;
  const momentum = trend >= 0.08 ? "IMPROVING" : trend <= -0.08 ? "SLIPPING" : "STABLE";

  const milestones = weakestDomains.map((item, index) => ({
    order: index + 1,
    title: `Raise ${titleCase(item.domain)} mastery`,
    target: Math.min(85, Math.max(55, Math.round(item.mastery + 15))),
    action: `Run a focused session on ${titleCase(item.domain)} with one remediation block and one scenario block.`,
  }));

  const recommendations = [
    ...weakestDomains.map((item) => `Prioritize ${titleCase(item.domain)} until mastery reaches at least ${Math.min(75, Math.round(item.mastery + 10))}.`),
    ...typeWeakness.slice(0, 2).map((item) => `Mix in more ${titleCase(item.type)} questions to reduce format-specific weakness.`),
  ].slice(0, 5);

  const nextSessionPlan = {
    warmupDomain: weakestDomains[0]?.domain || ctx.weakestDomain || "general",
    focusSubdomain: subdomainWeakness[0]?.subdomain || "general",
    targetDifficulty: ctx.weakestTargetDifficulty,
    suggestedMix: {
      remediation: 3,
      balanced: 3,
      stretch: 2,
      scenario: 2,
    },
  };

  return {
    momentum,
    weakestDomains,
    subdomainWeakness,
    typeWeakness,
    milestones,
    recommendations,
    nextSessionPlan,
    readinessScore: Math.max(0, Math.min(100, Math.round(100 - avg(weakestDomains.map((d) => 100 - d.mastery))))),
  };
}
