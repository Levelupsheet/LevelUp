import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/adminGuard";
import { prisma } from "@/lib/prisma";
import { normalizeQuestionType } from "@/lib/questionTypes";
import { clusterQuestionsBySimilarity, validateQuestionQuality } from "@/lib/questionQuality";

function asBucket(rows: any[], keyFn: (row: any) => string) {
  return rows.reduce((acc, row) => {
    const key = keyFn(row);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

export async function GET(req: Request) {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try {
    const { searchParams } = new URL(req.url);
    const setId = String(searchParams.get("setId") || "").trim();
    const lane = String(searchParams.get("lane") || "").trim().toUpperCase();
    const where: any = {};
    if (setId) {
      where.setId = setId;
    } else if (lane) {
      const placements = await prisma.questionSetPlacement.findMany({
        where: { lane: lane as any, isActive: true },
        select: { setId: true },
      });
      where.setId = { in: placements.map((row) => row.setId) };
    }

    const questions = await prisma.mCQQuestion.findMany({
      where,
      select: { id: true, prompt: true, type: true, difficulty: true, tags: true, data: true, choices: true, correctIndex: true, explanation: true, setId: true },
      take: 5000,
    });

    const byDomain = asBucket(questions, (row) => {
      const raw = row?.data && typeof row.data === "object" ? row.data : {};
      const fromData = String((raw as any)?.domainId || (raw as any)?.domain || "").trim().toUpperCase();
      const fromTags = Array.isArray(row?.tags) ? row.tags.find((tag: string) => /IDENT|NETWORK|SECUR|COMPUT|STOR|AZURE|AWS|WINDOWS|GENERAL/i.test(String(tag))) : null;
      return fromData || String(fromTags || "GENERAL").toUpperCase();
    });

    const bySubdomain = asBucket(questions, (row) => {
      const raw = row?.data && typeof row.data === "object" ? row.data : {};
      return String((raw as any)?.subdomain || (raw as any)?.topic || "GENERAL").trim().toUpperCase();
    });

    const byType = asBucket(questions, (row) => String(normalizeQuestionType(row?.type)).toLowerCase());
    const byDifficulty = asBucket(questions, (row) => String(Math.max(1, Math.min(3, Number(row?.difficulty || 1) || 1))));
    const byLifecycle = asBucket(questions, (row) => {
      const raw = row?.data && typeof row.data === "object" ? row.data : {};
      return String((raw as any)?.lifecycleStatus || "ACTIVE").trim().toUpperCase();
    });

    const qualityRows = questions.map((row) => ({ id: row.id, ...validateQuestionQuality(row as any) }));
    const avgQuality = qualityRows.length ? Number((qualityRows.reduce((sum, row) => sum + row.qualityScore, 0) / qualityRows.length).toFixed(1)) : 0;
    const lowQuality = qualityRows.filter((row) => row.qualityScore < 70);
    const clusters = clusterQuestionsBySimilarity(questions.map((q) => ({ id: q.id, prompt: q.prompt, type: q.type })), 0.84);
    const duplicateClusters = clusters.filter((c) => c.ids.length > 1);

    const warnings: string[] = [];
    for (const type of ["multiple_choice", "multi_select", "fill_blank", "sequence_order", "incident", "cli_command", "log_analysis"]) {
      if (!byType[type]) warnings.push(`Missing question type coverage: ${type}`);
    }
    for (const level of ["1", "2", "3"]) {
      if (!byDifficulty[level]) warnings.push(`Missing difficulty tier: ${level}`);
    }
    if (duplicateClusters.length) warnings.push(`${duplicateClusters.length} possible duplicate/similar question clusters detected`);
    if (lowQuality.length) warnings.push(`${lowQuality.length} questions scored below quality threshold`);

    return NextResponse.json({
      ok: true,
      total: questions.length,
      byDomain,
      bySubdomain,
      byType,
      byDifficulty,
      byLifecycle,
      quality: {
        average: avgQuality,
        lowQualityCount: lowQuality.length,
        lowQualityIds: lowQuality.slice(0, 50).map((row) => row.id),
      },
      similarity: {
        clusterCount: duplicateClusters.length,
        clusters: duplicateClusters.slice(0, 25),
      },
      warnings,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load coverage analytics" }, { status: 500 });
  }
}
