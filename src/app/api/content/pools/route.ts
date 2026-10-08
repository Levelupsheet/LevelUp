import { contentApiError } from '@/lib/contentApiError';
import { NextResponse } from "next/server";
import { getActiveContentPools } from "@/lib/activePools";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json({ pools: await getActiveContentPools() }); }
  catch (error) { console.error("Active pools load failed", error); return NextResponse.json({ error: contentApiError(error) }, { status: 500 }); }
}
