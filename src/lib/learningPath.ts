import { learningRecommendations } from "@/lib/learningEngine";
import { loadLearningAttempts } from "@/lib/learningHistory";
import { SUPPORTED_FORMATS } from "@/lib/contentPipeline";
import { getAdaptiveLearningContext } from "@/lib/adaptiveEngine";

function titleCase(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function masteryState(mastery: number) {
  if (mastery >= 85) return "MASTERED";
  if (mastery >= 70) return "STRENGTHENED";
  if (mastery >= 50) return "IMPROVING";
  return "FOCUS_AREA";
}

function avg(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export async function buildPersonalizedLearningPath(userId: string, options: { scopeKey?: string } = {}) {
  const ctx = await getAdaptiveLearningContext(userId, options);
  const measuredDomains = Object.entries(ctx.masteryByDomain).map(([domain,mastery])=>({domain,mastery:Number(mastery)}));
  const weakestDomains = Object.entries(ctx.masteryByDomain)
    .filter(([domain,mastery])=>ctx.dimensions.domain[domain]?.attempts >= 2 && mastery < 85)
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
    .filter(([type]) => (SUPPORTED_FORMATS as readonly string[]).includes(type))
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
    action: `Run a focused session on ${titleCase(item.domain)} with one remediation block and one multiple-choice application block.`,
  }));

  const recommendations = learningRecommendations(await loadLearningAttempts(userId,options));

  const primaryFocus = weakestDomains[0] || measuredDomains[0];
  const focusState = primaryFocus ? masteryState(primaryFocus.mastery) : "FOCUS_AREA";
  const nextSessionPlan = {
    warmupDomain: primaryFocus?.domain || ctx.weakestDomain || "general",
    focusSubdomain: subdomainWeakness[0]?.subdomain || "general",
    targetDifficulty: ctx.weakestTargetDifficulty,
    suggestedMix: focusState === "MASTERED"
      ? { remediation: 1, balanced: 3, stretch: 3, scenario: 3 }
      : focusState === "STRENGTHENED"
        ? { remediation: 1, balanced: 3, stretch: 3, scenario: 3 }
        : focusState === "IMPROVING"
          ? { remediation: 2, balanced: 4, stretch: 2, scenario: 2 }
          : { remediation: 4, balanced: 3, stretch: 1, scenario: 2 },
  };

  return {
    momentum,
    dimensions: ctx.dimensions,
    missedQuestionCount: ctx.missedQuestionIds.size,
    weakestDomains,
    masteryStates: measuredDomains.map((item) => ({ ...item, state: masteryState(item.mastery) })),
    subdomainWeakness,
    typeWeakness,
    milestones,
    recommendations,
    nextSessionPlan,
    learningLoop: {
      focusDomain: primaryFocus?.domain || ctx.weakestDomain || "general",
      state: focusState,
      strategy: focusState === "MASTERED" ? "maintenance" : focusState === "STRENGTHENED" ? "verify" : focusState === "IMPROVING" ? "reinforce" : "remediate",
    },
    readinessScore: Math.max(0, Math.min(100, Math.round(avg(measuredDomains.map(d=>d.mastery))))),
  };
}
