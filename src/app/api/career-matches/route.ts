import { NextResponse } from "next/server";
import { readCareerMatches } from "@/lib/careerMatches";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const level = Math.max(1, Number(url.searchParams.get("level") || 1));
  const domains = (url.searchParams.get("domains") || "")
    .split(",")
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);
  const masteryEntries = Object.fromEntries(url.searchParams.entries());
  const rows = await readCareerMatches();

  if (level < 7 || !domains.length) {
    return NextResponse.json({ ok: true, rows: [] });
  }

  const filtered = rows
    .filter((row) => row.isActive !== false)
    .filter((row) => level >= row.minLevel)
    .filter((row) => domains.includes(String(row.domain).toUpperCase()))
    .filter((row) => {
      const mastery = Number(masteryEntries[`m_${String(row.domain).toUpperCase()}`] || 0);
      return mastery >= Number(row.minMastery || 0);
    })
    .sort((a, b) => {
      const aMastery = Number(masteryEntries[`m_${String(a.domain).toUpperCase()}`] || 0);
      const bMastery = Number(masteryEntries[`m_${String(b.domain).toUpperCase()}`] || 0);
      return bMastery - aMastery || a.title.localeCompare(b.title);
    });

  return NextResponse.json({ ok: true, rows: filtered });
}
