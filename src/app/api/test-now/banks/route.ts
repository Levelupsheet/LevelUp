import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const placements = await prisma.questionSetPlacement.findMany({
    where: { lane: "TEST_NOW", isActive: true, set: { status: "PUBLISHED" } },
    include: { set: { select: { id:true, name:true, domain:true, _count:{ select:{ questions:true } } } } },
    orderBy: { createdAt: "desc" },
  });
  const byDomain = new Map<string,{domain:string;label:string;questionCount:number;setCount:number}>();
  for (const p of placements as any[]) {
    const domain = String(p.set?.domain || "GENERAL").toUpperCase();
    const cur = byDomain.get(domain) || { domain, label: domain === "GENERAL" ? "General" : domain.replaceAll("_"," "), questionCount:0, setCount:0 };
    cur.questionCount += Number(p.set?._count?.questions || 0);
    cur.setCount += 1;
    byDomain.set(domain, cur);
  }
  return NextResponse.json({
    banks: [
      { domain:"GENERAL", label:"Mixed", questionCount:Array.from(byDomain.values()).reduce((n,b)=>n+b.questionCount,0), setCount:placements.length, mixed:true },
      ...Array.from(byDomain.values()).sort((a,b)=>a.label.localeCompare(b.label)),
    ],
  });
}
