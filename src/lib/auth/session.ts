import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const AUTH_COOKIE = "levelup_session";
const STATE_COOKIE = "levelup_google_state";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  picture?: string | null;
};

type SessionPayload = {
  user: SessionUser;
  exp: number;
};

function base64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64");
}

function authSecret() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Missing AUTH_SECRET in environment");
  return secret;
}

function sign(value: string) {
  return base64url(createHmac("sha256", authSecret()).update(value).digest());
}

export function createSessionCookie(user: SessionUser) {
  const payload: SessionPayload = {
    user,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const raw = base64url(JSON.stringify(payload));
  const sig = sign(raw);
  return `${raw}.${sig}`;
}

export function verifySessionCookie(value?: string | null): SessionUser | null {
  if (!value) return null;
  const [raw, sig] = value.split(".");
  if (!raw || !sig) return null;

  const expected = sign(raw);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(fromBase64url(raw).toString("utf8")) as SessionPayload;
    if (!payload?.user?.id || !payload?.exp) return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload.user;
  } catch {
    return null;
  }
}

export async function getSessionUser() {
  const store = await cookies();
  return verifySessionCookie(store.get(AUTH_COOKIE)?.value ?? null);
}

export function makeSessionCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function setOauthStateCookie(state: string) {
  const store = await cookies();
  store.set(STATE_COOKIE, state, makeSessionCookieOptions(60 * 10));
}

export async function readOauthStateCookie() {
  const store = await cookies();
  return store.get(STATE_COOKIE)?.value ?? null;
}

export async function clearOauthStateCookie() {
  const store = await cookies();
  store.set(STATE_COOKIE, "", makeSessionCookieOptions(0));
}
