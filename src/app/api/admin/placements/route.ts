import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/adminGuard";
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
    const startingPosition = body?.startingPosition ?? null;
    const certExam = body?.certExam ?? null;
    const exclusive = Boolean(body?.exclusive);
    const isActive = body?.isActive === false ? false : true;

    if (!setId || !lane) {
      return NextResponse.json({ error: "setId and lane are required" }, { status: 400 });
    }
    if (lane === "TRAINING" && !startingPosition) {
      return NextResponse.json({ error: "startingPosition is required for TRAINING" }, { status: 400 });
    }
    if (lane === "CERTIFICATIONS" && !certExam) {
      return NextResponse.json({ error: "certExam is required for CERTIFICATIONS" }, { status: 400 });
    }

    const whereDeactivate: any = { lane, isActive: true };
    if (lane === "TRAINING") whereDeactivate.startingPosition = startingPosition;
    if (lane === "CERTIFICATIONS") whereDeactivate.certExam = certExam;
    if (lane === "TEST_NOW") {
      // nothing extra
    }

    const created = await prisma.$transaction(async (tx: any) => {
      if (exclusive) {
        await tx.questionSetPlacement.updateMany({
          where: whereDeactivate,
          data: { isActive: false },
        });
      }

      const existing = await tx.questionSetPlacement.findFirst({
        where: {
          setId,
          lane,
          isActive,
          startingPosition: lane === "TRAINING" ? startingPosition : null,
          certExam: lane === "CERTIFICATIONS" ? certExam : null,
        },
      });
      if (existing) return existing;

      return tx.questionSetPlacement.create({
        data: {
          setId,
          lane,
          startingPosition: lane === "TRAINING" ? startingPosition : null,
          certExam: lane === "CERTIFICATIONS" ? certExam : null,
          isActive,
        },
      });
    });

    return NextResponse.json({ ok: true, placement: created, mode: exclusive ? "replaced" : "added_to_bank" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to assign placement" }, { status: 500 });
  }
}

export async function GET() {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  const placements = await prisma.questionSetPlacement.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { set: true },
  });
  return NextResponse.json({ placements });
}
