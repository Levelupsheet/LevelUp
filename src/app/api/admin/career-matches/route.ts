import { NextResponse } from "next/server";
import { readCareerMatches, writeCareerMatches } from "@/lib/careerMatches";
import { requireAdminRequest } from "@/app/api/_lib/adminGuard";

export async function GET() {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  const rows = await readCareerMatches();
  return NextResponse.json({ ok: true, rows });
}

export async function POST(req: Request) {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try {
    const body = await req.json();
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    await writeCareerMatches(rows as any);
    const saved = await readCareerMatches();
    return NextResponse.json({ ok: true, rows: saved });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to save career matches" }, { status: 500 });
  }
}
