import { NextResponse } from "next/server";
import { readCareerMatches } from "@/lib/careerMatches";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const level = Math.max(1, Number(url.searchParams.get("level") || 1));
  const domains = (url.searchParams.get("domains") || "").split(",").map((v) => v.trim().toUpperCase()).filter(Boolean);
  const mastery = Object.fromEntries(url.searchParams.entries());
  const rows = await readCareerMatches();
  const filtered = rows.filter((row) => {
    if (level < row.minLevel) return false;
    if (!domains.length) return true;
    if (!domains.includes(String(row.domain).toUpperCase())) return false;
    const m = Number(mastery[`m_${String(row.domain).toUpperCase()}`] || 0);
    return m >= Number(row.minMastery || 0);
  });
  return NextResponse.json({ ok: true, rows: filtered });
}
