import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/adminGuard";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try{
    const sets = await prisma.questionSet.findMany({
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: { _count: { select: { questions: true, placements: true } } },
    });
    return NextResponse.json({ sets });
  }catch(e:any){
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try{
    const body = await req.json();
    const domain = String(body.domain || "NETWORKING").toUpperCase();
    const name = String(body.name || "Networking Set").trim();
    const status = body.status || "DRAFT";

    const set = await prisma.questionSet.create({
      data: { domain: domain as any, name, status },
    });
    return NextResponse.json({ set });
  }catch(e:any){
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
