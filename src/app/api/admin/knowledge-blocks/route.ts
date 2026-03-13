import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/adminGuard";
import { prisma } from "@/lib/prisma";
import { normalizeKnowledgeBlock } from "@/lib/contentEngine";

export async function GET() {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try {
    const blocks = await prisma.knowledgeBlock.findMany({
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        _count: { select: { generatedQuestions: true } },
      },
    });
    return NextResponse.json({ blocks });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load knowledge blocks" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try {
    const body = await req.json();
    const incoming = Array.isArray(body?.blocks) ? body.blocks : [body];
    if (!incoming.length) return NextResponse.json({ error: "No knowledge blocks provided" }, { status: 400 });

    const saved = [];
    for (let i = 0; i < incoming.length; i += 1) {
      const block = normalizeKnowledgeBlock(incoming[i], i);
      const record = await prisma.knowledgeBlock.upsert({
        where: { sourceBlockId: block.sourceBlockId },
        update: {
          title: block.title,
          setName: block.setName,
          domain: block.domain,
          lane: block.lane,
          startingPosition: block.startingPosition,
          certExam: block.certExam,
          difficulty: block.difficulty,
          stage: block.stage,
          tags: block.tags,
          source: block.source,
          contentJson: block.contentJson,
          status: "DRAFT",
        },
        create: {
          sourceBlockId: block.sourceBlockId,
          title: block.title,
          setName: block.setName,
          domain: block.domain,
          lane: block.lane,
          startingPosition: block.startingPosition,
          certExam: block.certExam,
          difficulty: block.difficulty,
          stage: block.stage,
          tags: block.tags,
          source: block.source,
          contentJson: block.contentJson,
          status: "DRAFT",
        },
      });
      saved.push(record);
    }

    return NextResponse.json({ ok: true, count: saved.length, blocks: saved });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to save knowledge blocks" }, { status: 500 });
  }
}
