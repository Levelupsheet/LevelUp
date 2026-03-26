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
  difficulty: 1 | 2 | 3;
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
    typeTargets: {
      multiple_choice: 35,
      multi_select: 15,
      fill_blank: 10,
      sequence_order: 10,
      incident: 10,
      cli_command: 10,
      log_analysis: 10,
    },
  },
  TRAINING: {
    lane: "TRAINING",
    domainQuota: { weakness: 45, balanced: 25, review: 20, stretch: 10 },
    typeTargets: {
      multiple_choice: 40,
      multi_select: 15,
      fill_blank: 10,
      sequence_order: 10,
      incident: 10,
      cli_command: 10,
      log_analysis: 5,
    },
  },
  CERTIFICATIONS: {
    lane: "CERTIFICATIONS",
    domainQuota: { weakness: 30, balanced: 30, review: 20, stretch: 20 },
    typeTargets: {
      multiple_choice: 45,
      multi_select: 20,
      fill_blank: 10,
      sequence_order: 8,
      incident: 7,
      cli_command: 5,
      log_analysis: 5,
    },
  },
};

export function getBankRule(lane?: string | null): BankCompositionRule {
  return DEFAULT_RULES[String(lane || "TEST_NOW").toUpperCase()] || DEFAULT_RULES.TEST_NOW;
}

export function buildSessionBlueprint(questionCount: number, weakestTargetDifficulty: 1 | 2 | 3): SessionBlueprintStep[] {
  const steps: SessionBlueprintStep[] = [];
  const base: SessionBlueprintStep[] = [
    { mode: "weakness", difficulty: 1, preferredTypes: ["multiple_choice", "fill_blank"], weakFocus: true },
    { mode: "weakness", difficulty: weakestTargetDifficulty, preferredTypes: ["multiple_choice", "multi_select"], weakFocus: true },
    { mode: "balanced", difficulty: Math.min(3, weakestTargetDifficulty + 0) as 1 | 2 | 3, preferredTypes: ["multiple_choice", "incident"] },
    { mode: "review", difficulty: 1, preferredTypes: ["multiple_choice", "fill_blank"], weakFocus: true },
    { mode: "balanced", difficulty: 2, preferredTypes: ["multi_select", "sequence_order"] },
    { mode: "stretch", difficulty: 3, preferredTypes: ["incident", "cli_command", "log_analysis"] },
    { mode: "scenario", difficulty: 3, preferredTypes: ["incident", "cli_command", "log_analysis"] },
    { mode: "review", difficulty: 2, preferredTypes: ["multiple_choice", "multi_select"] },
  ];

  for (let i = 0; i < Math.max(1, questionCount); i += 1) {
    steps.push(base[i % base.length]);
  }
  return steps.slice(0, questionCount);
}
