import type { SubscriptionTier } from "@/lib/subscriptions";

export type Entitlements = {
  tier: SubscriptionTier;
  sessionCooldownMinutes: number;
  xpMultiplier: number;
  lootLuck: number;
  advancedAnalytics: boolean;
  interviewSimulationsPerDay: number;
  adaptiveDepth: "standard" | "enhanced" | "elite";
  prioritySupport: boolean;
  rewardsTrack: "core" | "pro" | "premium";
  label: string;
  upgradeCta: string;
  perks: string[];
};

export function getTierEntitlements(tier?: string | null): Entitlements {
  const normalized = String(tier || "FREE").toUpperCase() as SubscriptionTier;
  if (normalized === "PREMIUM") {
    return {
      tier: "PREMIUM",
      sessionCooldownMinutes: 0,
      xpMultiplier: 1.25,
      lootLuck: 1.4,
      advancedAnalytics: true,
      interviewSimulationsPerDay: 10,
      adaptiveDepth: "elite",
      prioritySupport: true,
      rewardsTrack: "premium",
      label: "Premium",
      upgradeCta: "You have the full Premium path unlocked.",
      perks: [
        "No session cooldowns",
        "+25% XP acceleration on eligible practice rewards",
        "Highest loot luck and premium reward track",
        "Elite adaptive learning depth",
        "Advanced analytics + interview readiness insights",
        "Up to 10 interview simulations per day",
      ],
    };
  }
  if (normalized === "PRO") {
    return {
      tier: "PRO",
      sessionCooldownMinutes: 0,
      xpMultiplier: 1.1,
      lootLuck: 1.15,
      advancedAnalytics: true,
      interviewSimulationsPerDay: 5,
      adaptiveDepth: "enhanced",
      prioritySupport: false,
      rewardsTrack: "pro",
      label: "Pro",
      upgradeCta: "Upgrade to Premium for elite analytics, more simulations, and higher reward luck.",
      perks: [
        "No session cooldowns",
        "+10% XP acceleration on eligible practice rewards",
        "Enhanced adaptive learning depth",
        "Advanced analytics enabled",
        "Up to 5 interview simulations per day",
      ],
    };
  }
  return {
    tier: "FREE",
    sessionCooldownMinutes: 30,
    xpMultiplier: 1,
    lootLuck: 1,
    advancedAnalytics: false,
    interviewSimulationsPerDay: 2,
    adaptiveDepth: "standard",
    prioritySupport: false,
    rewardsTrack: "core",
    label: "Free",
    upgradeCta: "Upgrade to Pro to remove cooldowns, unlock analytics, and improve reward odds.",
    perks: [
      "30-minute cooldown after level 3 sessions",
      "Core reward track",
      "Standard adaptive learning",
      "2 interview simulations per day",
    ],
  };
}

export function nextTier(tier?: string | null): SubscriptionTier | null {
  const normalized = String(tier || "FREE").toUpperCase();
  if (normalized === "FREE") return "PRO";
  if (normalized === "PRO") return "PREMIUM";
  return null;
}
