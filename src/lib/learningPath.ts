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
    ...weakestDomains.map((item) => item.mastery >= 85
      ? `${titleCase(item.domain)} is mastered. Maintain it with occasional mixed review.`
      : item.mastery >= 70
        ? `${titleCase(item.domain)} is strengthened. Use harder scenario questions to verify durable mastery.`
        : item.mastery >= 50
          ? `${titleCase(item.domain)} is improving. Continue targeted practice until mastery reaches at least ${Math.min(75, Math.round(item.mastery + 10))}.`
          : `Prioritize ${titleCase(item.domain)} until mastery reaches at least ${Math.min(75, Math.round(item.mastery + 10))}.`),
    ...typeWeakness.slice(0, 2).map((item) => `Mix in more ${titleCase(item.type)} questions to reduce format-specific weakness.`),
  ].slice(0, 5);

  const primaryFocus = weakestDomains.find((item) => item.mastery < 85) || weakestDomains[0];
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
    weakestDomains,
    masteryStates: weakestDomains.map((item) => ({ ...item, state: masteryState(item.mastery) })),
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
    readinessScore: Math.max(0, Math.min(100, Math.round(100 - avg(weakestDomains.map((d) => 100 - d.mastery))))),
  };
}
