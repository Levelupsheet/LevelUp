import { NextResponse } from "next/server";
import { getActiveContentPools } from "@/lib/activePools";
import { testNowBanks } from "@/lib/contentPools";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json({ banks: testNowBanks(await getActiveContentPools()) }); }
  catch { return NextResponse.json({ error: "Could not load active Test Now banks" }, { status: 500 }); }
}
