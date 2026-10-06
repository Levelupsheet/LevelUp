import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const LEGACY_LABELS: Record<string, { industry: string; careerPath: string }> = {
  HELPDESK_SUPPORT: { industry: "Information Technology", careerPath: "Help Desk" },
  DESKTOP_TECHNICIAN: { industry: "Information Technology", careerPath: "Desktop Technician" },
  CLOUD_ENGINEER: { industry: "Information Technology", careerPath: "Cloud Engineer" },
};

export async function GET() {
  try {
    const rows = await prisma.questionSetPlacement.findMany({
      where: { lane: "TRAINING", isActive: true },
      select: { industry: true, careerPath: true, startingPosition: true, setId: true },
      orderBy: { createdAt: "asc" },
    });
    const map = new Map<string, { industry: string; careerPath: string; poolCount: number }>();
    for (const row of rows as any[]) {
      const legacy = row.startingPosition ? LEGACY_LABELS[String(row.startingPosition)] : null;
      const industry = String(row.industry || legacy?.industry || "Other").trim();
      const careerPath = String(row.careerPath || legacy?.careerPath || row.startingPosition || "").trim();
      if (!careerPath) continue;
      const key = industry.toLowerCase() + "::" + careerPath.toLowerCase();
      const prior = map.get(key);
      map.set(key, { industry, careerPath, poolCount: (prior?.poolCount || 0) + 1 });
    }
    const paths = Array.from(map.values()).sort((a,b) => a.industry.localeCompare(b.industry) || a.careerPath.localeCompare(b.careerPath));
    return NextResponse.json({ industries: Array.from(new Set(paths.map(p => p.industry))), paths });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load career paths" }, { status: 500 });
  }
}
