import { NextResponse } from "next/server";
import { exchangeCodeForTokens, fetchGoogleProfile } from "@/lib/auth/google";
import { clearOauthStateCookie, createSessionCookie, makeSessionCookieOptions, readOauthStateCookie, AUTH_COOKIE } from "@/lib/auth/session";
import { upsertGoogleUser } from "@/app/api/_lib/authUser";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const origin = url.origin;

  if (error) {
    return NextResponse.redirect(`${origin}/dashboard?authError=${encodeURIComponent(error)}`);
  }

  const expectedState = await readOauthStateCookie();
  await clearOauthStateCookie();
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(`${origin}/dashboard?authError=state_mismatch`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code, origin);
    const profile = await fetchGoogleProfile(tokens.access_token);

    if (!profile.email || !profile.sub) {
      throw new Error("Google profile is missing email or subject");
    }

    const sessionUser = {
      id: `google:${profile.sub}`,
      email: profile.email,
      name: profile.name || profile.email,
      picture: profile.picture ?? null,
    };

    await upsertGoogleUser(sessionUser);

    const response = NextResponse.redirect(`${origin}/dashboard`);
    response.cookies.set(AUTH_COOKIE, createSessionCookie(sessionUser), makeSessionCookieOptions());
    return response;
  } catch (error: any) {
    return NextResponse.redirect(`${origin}/dashboard?authError=${encodeURIComponent(error?.message ?? "google_login_failed")}`);
  }
}
