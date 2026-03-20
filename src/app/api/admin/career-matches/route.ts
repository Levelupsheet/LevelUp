import { NextResponse } from "next/server";
import { readCareerMatches, writeCareerMatches } from "@/lib/careerMatches";

export async function GET() {
  const rows = await readCareerMatches();
  return NextResponse.json({ ok: true, rows });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    await writeCareerMatches(rows as any);
    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to save career matches" }, { status: 500 });
  }
}
