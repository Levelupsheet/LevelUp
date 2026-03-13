import { getSessionUser } from "@/lib/auth/session";

export function getAdminWhitelist(): string[] {
  const raw = process.env.ADMIN_EMAIL_WHITELIST || "";
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return getAdminWhitelist().includes(String(email).trim().toLowerCase());
}

export async function requireAdminSession() {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.email || !isAdminEmail(sessionUser.email)) {
    return null;
  }
  return sessionUser;
}
