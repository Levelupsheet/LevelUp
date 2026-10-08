import { NextResponse } from "next/server";
import { getActiveContentPools } from "@/lib/activePools";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const paths = (await getActiveContentPools()).filter(p => p.lane === "TRAINING" && p.questionCount > 0)
      .map(p => ({ industry: p.industry!, careerPath: p.careerPath!, poolCount: p.poolCount, questionCount: p.questionCount }));
    return NextResponse.json({ industries: Array.from(new Set(paths.map(p => p.industry))), paths });
  } catch { return NextResponse.json({ error: "Failed to load career paths" }, { status: 500 }); }
}
