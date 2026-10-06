import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRequest } from "@/lib/adminAuth";

const STARTERS = [
  ["Information Technology","Help Desk"],["Information Technology","Desktop Technician"],["Information Technology","Cloud Engineer"],
  ["Healthcare","CNA"],["Healthcare","LPN"],["Healthcare","RN"],
  ["Transportation","CDL Driver"],
  ["Sales","Sales Representative"],["Sales","Account Executive"],["Sales","SDR / BDR"],["Sales","Sales Manager"],
  ["Software Development","Front-End Developer"],["Software Development","Back-End Developer"],["Software Development","Full-Stack Developer"],["Software Development","Software Engineer"],
  ["Real Estate","Real Estate Agent"],["Real Estate","Real Estate Broker"],["Real Estate","Property Manager"],["Real Estate","Leasing Agent"],
] as const;

export async function GET() {
  const rows = await prisma.careerCatalog.findMany({ where:{ isActive:true }, orderBy:[{industry:"asc"},{sortOrder:"asc"},{careerPath:"asc"}] });
  return NextResponse.json({ careers: rows, starterSuggestions: STARTERS.map(([industry,careerPath])=>({industry,careerPath})) });
}
export async function POST(req: Request) {
  const auth = await requireAdminRequest(req); if (!auth.ok) return auth.response;
  const body = await req.json();
  const industry = String(body?.industry || "").trim();
  const careerPath = String(body?.careerPath || "").trim();
  if (!industry || !careerPath) return NextResponse.json({error:"Industry and career path are required."},{status:400});
  const row = await prisma.careerCatalog.upsert({
    where:{ industry_careerPath:{industry,careerPath} },
    update:{isActive:true},
    create:{industry,careerPath},
  });
  return NextResponse.json({ok:true,career:row});
}
export async function DELETE(req: Request) {
  const auth = await requireAdminRequest(req); if (!auth.ok) return auth.response;
  const body = await req.json();
  const id = String(body?.id || "");
  if (!id) return NextResponse.json({error:"id required"},{status:400});
  await prisma.careerCatalog.update({where:{id},data:{isActive:false}});
  return NextResponse.json({ok:true});
}
