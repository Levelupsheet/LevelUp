export type AuthMeResponse = {
  ok: boolean;
  authenticated: boolean;
  user?: {
    id: string;
    email: string;
    name: string;
    picture?: string | null;
    xp?: number;
    startingPosition?: string | null;
    moduleChoice?: string | null;
  };
};

export async function fetchAuthMe(): Promise<AuthMeResponse> {
  const res = await fetch("/api/auth/me", { cache: "no-store" });
  const data = (await res.json().catch(() => null)) as AuthMeResponse | null;
  if (!res.ok || !data) return { ok: false, authenticated: false };
  return data;
}
