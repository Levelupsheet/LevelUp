import { prisma } from "@/lib/prisma";
import { getRequestUserId } from "@/app/api/_lib/authUser";
import { addHours, buildVerificationUrl, createVerificationToken, FREE_ENTRY_TOKEN_HOURS, getOrCreateActiveSweepstakes, normalizeEmail, verifyCaptchaToken } from "@/lib/raffle";
import { canAccessSweepstakesPreview, isSweepstakesPublicEnabled } from "@/lib/sweepstakesConfig";

export async function POST(req: Request) {
  try {
    const publicEnabled = isSweepstakesPublicEnabled();
    const previewAllowed = await canAccessSweepstakesPreview();
    if (!publicEnabled && !previewAllowed) {
      return Response.json({ ok: false, error: "Sweepstakes free entry is not live yet." }, { status: 403 });
    }
    const body = await req.json().catch(() => ({} as any));
    const email = String(body?.email || "").trim();
    const captchaToken = String(body?.captchaToken || "").trim();
    let userId = String(body?.userId || (await getRequestUserId(req)) || "").trim() || null;

    if (!email || !email.includes("@")) {
      return Response.json({ ok: false, error: "Valid email required" }, { status: 400 });
    }
    if (!captchaToken) {
      return Response.json({ ok: false, error: "captchaToken required" }, { status: 400 });
    }

    const captcha = await verifyCaptchaToken(captchaToken, null);
    if (!captcha.ok) {
      return Response.json({ ok: false, error: "Captcha verification failed", captchaProvider: captcha.provider }, { status: 400 });
    }

    const normalized = normalizeEmail(email);
    if (!userId) {
      const existingUser = await prisma.user.findUnique({ where: { email: normalized }, select: { id: true } });
      userId = existingUser?.id || null;
    }
    const token = createVerificationToken();
    const now = new Date();
    const campaign = await getOrCreateActiveSweepstakes(prisma);

    const alreadyVerified = await prisma.freeEntrySubmission.findFirst({
      where: { campaignId: campaign.id, normalizedEmail: normalized, verifiedAt: { not: null } },
      select: { id: true },
    });
    if (alreadyVerified) {
      return Response.json({ ok: false, error: "This email has already claimed the free entry for the current sweepstakes." }, { status: 409 });
    }

    const submission = await prisma.freeEntrySubmission.upsert({
      where: { campaignId_normalizedEmail: { campaignId: campaign.id, normalizedEmail: normalized } },
      update: {
        email,
        userId: userId || undefined,
        captchaProvider: captcha.provider,
        captchaVerifiedAt: now,
        verificationToken: token,
        verificationExpiresAt: addHours(now, FREE_ENTRY_TOKEN_HOURS),
        meta: { score: captcha.score ?? 0 } as any,
      },
      create: {
        campaignId: campaign.id,
        userId: userId || undefined,
        email,
        normalizedEmail: normalized,
        captchaProvider: captcha.provider,
        captchaVerifiedAt: now,
        verificationToken: token,
        verificationExpiresAt: addHours(now, FREE_ENTRY_TOKEN_HOURS),
        meta: { score: captcha.score ?? 0 } as any,
      },
    });

    const verificationUrl = buildVerificationUrl(submission.verificationToken);
    return Response.json({
      ok: true,
      enabled: publicEnabled,
      message: "Verification required. Open the verification URL to finalize the free entry.",
      verificationUrl,
      previewEmail: {
        to: email,
        subject: "Verify your LevelUp Pro sweepstakes free entry",
        body: `Open this link to verify your free entry: ${verificationUrl}`,
      },
    });
  } catch (error: any) {
    return Response.json({ ok: false, error: "Failed to create free entry", detail: String(error?.message || error) }, { status: 500 });
  }
}
