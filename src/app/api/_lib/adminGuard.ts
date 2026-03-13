import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";

export async function requireAdminRequest() {
  const sessionUser = await requireAdminSession();
  if (!sessionUser) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    sessionUser,
  };
}
