import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { buildGoogleAuthUrl } from "@/lib/auth/google";
import { setOauthStateCookie } from "@/lib/auth/session";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const state = randomBytes(24).toString("hex");
  await setOauthStateCookie(state);
  return NextResponse.redirect(buildGoogleAuthUrl(origin, state));
}
