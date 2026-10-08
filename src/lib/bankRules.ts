export type SessionBlueprintStepMode =
  | "weakness"
  | "recovery"
  | "balanced"
  | "stretch"
  | "challenge"
  | "review"
  | "scenario";

export type SessionBlueprintStep = {
  mode: SessionBlueprintStepMode;
  difficulty: 1 | 2 | 3 | 4 | 5;
  preferredTypes?: string[];
  weakFocus?: boolean;
};

export type BankCompositionRule = {
  lane: string;
  domainQuota: { weakness: number; balanced: number; review: number; stretch: number };
  typeTargets: Record<string, number>;
};

const DEFAULT_RULES: Record<string, BankCompositionRule> = {
  TEST_NOW: {
    lane: "TEST_NOW",
    domainQuota: { weakness: 40, balanced: 25, review: 15, stretch: 20 },
    typeTargets: { multiple_choice: 60, true_false: 20, cli_command: 20 },
  },
  TRAINING: {
    lane: "TRAINING",
    domainQuota: { weakness: 45, balanced: 25, review: 20, stretch: 10 },
    typeTargets: { multiple_choice: 60, true_false: 20, cli_command: 20 },
  },
  CERTIFICATIONS: {
    lane: "CERTIFICATIONS",
    domainQuota: { weakness: 30, balanced: 30, review: 20, stretch: 20 },
    typeTargets: { multiple_choice: 60, true_false: 20, cli_command: 20 },
  },
};

export function getBankRule(lane?: string | null): BankCompositionRule {
  return DEFAULT_RULES[String(lane || "TEST_NOW").toUpperCase()] || DEFAULT_RULES.TEST_NOW;
}

export function buildSessionBlueprint(questionCount: number, weakestTargetDifficulty: 1 | 2 | 3 | 4 | 5): SessionBlueprintStep[] {
  // Three questions per tier in a full 15-question run. Short banks use only
  // their available content; selecting a target never changes an authored tier.
  const count = Math.max(0, Math.floor(questionCount));
  return Array.from({ length: count }, (_, index): SessionBlueprintStep => ({
    mode: index < Math.ceil(count / 5) ? "weakness" : index >= Math.floor(count * 0.8) ? "challenge" : "balanced",
    difficulty: Math.min(5, Math.floor(index * 5 / Math.max(1, count)) + 1) as 1 | 2 | 3 | 4 | 5,
    weakFocus: index < Math.ceil(count / 5),
    preferredTypes: ["multiple_choice", "true_false", "cli_command"],
  }));
}
