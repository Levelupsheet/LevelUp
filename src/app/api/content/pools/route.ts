import { NextResponse } from "next/server";
import { getActiveContentPools } from "@/lib/activePools";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json({ pools: await getActiveContentPools() }); }
  catch { return NextResponse.json({ error: "Could not load active question pools" }, { status: 500 }); }
}
