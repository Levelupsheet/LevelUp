import { contentApiError } from '@/lib/contentApiError';
import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/adminGuard";
import { buildContentPoolCatalog, testNowBanks, canonicalTrainingTarget, trainingPlacementFilter } from "@/lib/contentPools";
import { learnerEligible } from "@/lib/contentPipeline";
import { prisma } from "@/lib/prisma";

/**
 * Admin: Assign a QuestionSet to a lane.
 *
 * By default this ADDS the set into the live bank for the selected lane/filter,
 * allowing multiple active sets to contribute questions to a single quiz mode.
 *
 * Optional request flags:
 * - exclusive: true => deactivate prior active placements for the same lane/filter first
 * - isActive: false => create an inactive placement record
 */
export async function POST(req: Request) {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try {
    const body = await req.json();
    const setId = String(body?.setId || "");
    const lane = body?.lane as "TEST_NOW" | "TRAINING" | "CERTIFICATIONS" | "INTERVIEW";
    const { startingPosition, industry, careerPath } = canonicalTrainingTarget(body);
    const certExam = body?.certExam ?? null;
    const exclusive = Boolean(body?.exclusive);
    const isActive = body?.isActive === false ? false : true;

    if (!setId || !["TEST_NOW", "TRAINING", "CERTIFICATIONS", "INTERVIEW"].includes(lane)) {
      return NextResponse.json({ error: "setId and lane are required" }, { status: 400 });
    }
    if (lane === "TRAINING" && !careerPath && !startingPosition) {
      return NextResponse.json({ error: "careerPath is required for TRAINING" }, { status: 400 });
    }
    if (lane === "CERTIFICATIONS" && !certExam) {
      return NextResponse.json({ error: "certExam is required for CERTIFICATIONS" }, { status: 400 });
    }

    const set = await prisma.questionSet.findUnique({ where: { id: setId }, select: { status: true, domain: true, _count: { select: { questions: true } } } });
    if (!set) return NextResponse.json({ error: "Question pool not found" }, { status: 404 });
    if (isActive && !set._count.questions) return NextResponse.json({ error: "Add questions before publishing this pool" }, { status: 400 });

    const whereDeactivate: any = { lane, isActive: true };
    if (lane === "TRAINING") {
      if (careerPath) { whereDeactivate.industry = industry; whereDeactivate.careerPath = careerPath; }
      else { whereDeactivate.startingPosition = startingPosition; whereDeactivate.careerPath = null; }
    }
    if (lane === "CERTIFICATIONS") whereDeactivate.certExam = certExam;
    if (lane === "TEST_NOW") {
      whereDeactivate.set = { domain: set.domain };
    }

    const created = await prisma.$transaction(async (tx: any) => {
      if (isActive) {
        const questions = await tx.mCQQuestion.findMany({ where: { setId } });
        if (!questions.some(learnerEligible)) throw new Error("Review and approve valid questions before publishing");
      }
      // The Admin Publish pool action publishes the set and placement together.
      if (isActive) await tx.questionSet.update({ where: { id: setId }, data: { status: "PUBLISHED" } });
      if (exclusive) {
        await tx.questionSetPlacement.updateMany({
          where: whereDeactivate,
          data: { isActive: false },
        });
      }

      const placementFilter = {
        setId,
        lane,
        startingPosition: lane === "TRAINING" && !careerPath ? startingPosition : null,
        industry: lane === "TRAINING" ? industry : null,
        careerPath: lane === "TRAINING" ? careerPath : null,
        certExam: lane === "CERTIFICATIONS" ? certExam : null,
      };
      // Reactivate a previously unpublished placement rather than creating duplicates.
      const matchingTarget = lane === "TRAINING"
        ? { setId, lane, certExam: null, ...trainingPlacementFilter({ industry, careerPath, startingPosition }) }
        : placementFilter;
      const existing = await tx.questionSetPlacement.findFirst({
        where: matchingTarget,
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        if (isActive) await tx.questionSetPlacement.updateMany({ where: { ...matchingTarget, id: { not: existing.id }, isActive: true }, data: { isActive: false } });
        return tx.questionSetPlacement.update({
          where: { id: existing.id }, data: { ...placementFilter, isActive },
        });
      }
      return tx.questionSetPlacement.create({
        data: { ...placementFilter, isActive },
      });
    });

    return NextResponse.json({ ok: true, placement: created, mode: exclusive ? "replaced" : "added_to_bank" });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "This pool is already live for that destination. Refresh Live Pools." }, { status: 409 });
    return NextResponse.json({ error: e?.message || "Failed to assign placement" }, { status: 500 });
  }
}

async function loadContent() {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  const placements = await prisma.questionSetPlacement.findMany({
    orderBy: { createdAt: "desc" },
    include: { set: { include: { questions: true, _count: { select: { questions: true } } } } },
  });
  const activePools = buildContentPoolCatalog(placements);
  return NextResponse.json({ placements, activePools, activeTestNowBanks: testNowBanks(activePools) });
}

/** Deactivate one exact placement without deleting its question set. */
export async function PATCH(req: Request) {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    if (!id) return NextResponse.json({ error: "Placement id is required" }, { status: 400 });
    const result = await prisma.questionSetPlacement.updateMany({
      where: { id, isActive: true },
      data: { isActive: false },
    });
    if (!result.count) return NextResponse.json({ error: "Active placement not found" }, { status: 404 });
    return NextResponse.json({ ok: true, deactivated: result.count });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to unpublish pool" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try { return await loadContent(); }
  catch (error) { console.error("Admin content load failed", error); return NextResponse.json({ error: contentApiError(error) }, { status: 500 }); }
}
