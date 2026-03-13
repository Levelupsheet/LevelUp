import { requireAdminSession } from "@/lib/adminAuth";

export function isSweepstakesPublicEnabled() {
  return String(process.env.SWEEPSTAKES_PUBLIC_ENABLED || "false").trim().toLowerCase() === "true";
}

export async function canAccessSweepstakesPreview() {
  if (isSweepstakesPublicEnabled()) return true;
  const admin = await requireAdminSession();
  return Boolean(admin);
}
