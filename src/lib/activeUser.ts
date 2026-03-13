"use client";

import { getActiveUser, syncAuthenticatedUser } from "@/lib/userStore";
import { fetchAuthMe } from "@/lib/auth/client";

export function resolveClientUserId(fallback = "demo-user") {
  try {
    const user = getActiveUser();
    if (user?.id) return user.id;
  } catch {}

  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("userId") || params.get("uid");
    if (fromQuery) return fromQuery;
  } catch {}

  return fallback;
}

export async function hydrateAuthenticatedUser() {
  try {
    const data = await fetchAuthMe();
    if (!data.authenticated || !data.user) return null;
    return syncAuthenticatedUser({
      id: data.user.id,
      displayName: data.user.name,
      email: data.user.email,
      xp: data.user.xp ?? 0,
    });
  } catch {
    return null;
  }
}
