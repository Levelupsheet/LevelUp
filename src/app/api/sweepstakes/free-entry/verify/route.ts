import { prisma } from "@/lib/prisma";
import { awardRaffleEntries } from "@/lib/raffle";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = String(url.searchParams.get("token") || "").trim();
  if (!token) {
    return Response.redirect(new URL("/sweepstakes?freeEntry=missing-token", req.url));
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const submission = await tx.freeEntrySubmission.findUnique({ where: { verificationToken: token } });
      if (!submission) throw new Error("Verification token not found");
      if (submission.verifiedAt) return { status: "already_verified" as const, awarded: 0 };
      if (submission.verificationExpiresAt < new Date()) throw new Error("Verification link expired");
      const effectiveUserId = submission.userId || (await tx.user.findUnique({ where: { email: submission.normalizedEmail }, select: { id: true } }))?.id;
      if (!effectiveUserId) throw new Error("Free entry is not linked to a user account");

      const awarded = await awardRaffleEntries(tx as any, {
        userId: effectiveUserId,
        source: "FREE_ENTRY",
        quantity: 1,
        campaignId: submission.campaignId,
        meta: { submissionId: submission.id, email: submission.normalizedEmail },
        sourceRefType: "FREE_ENTRY_SUBMISSION",
        sourceRefId: submission.id,
        auditKey: `free-entry:${submission.id}`,
      });

      await tx.freeEntrySubmission.update({
        where: { id: submission.id },
        data: { verifiedAt: new Date(), userId: effectiveUserId },
      });

      return { status: "verified" as const, awarded: awarded.awarded };
    });

    return Response.redirect(new URL(`/sweepstakes?freeEntry=${result.status}&awarded=${result.awarded}`, req.url));
  } catch (error: any) {
    const message = encodeURIComponent(String(error?.message || error));
    return Response.redirect(new URL(`/sweepstakes?freeEntry=error&message=${message}`, req.url));
  }
}
