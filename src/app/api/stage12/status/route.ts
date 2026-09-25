
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deriveStage12Profile, getStage12Profile, saveStage12Profile } from "@/lib/stage12";
import { getSessionUser } from "@/lib/auth/session";

export async function GET(req: Request) {
  try {
    const sessionUser = await getSessionUser();
    const userId = String(sessionUser?.id || "").trim();
    if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const cached = getStage12Profile(userId);
    const latestResume = await prisma.resumeFile.findFirst({
      where: { userId },
      orderBy: { uploadedAt: "desc" },
      select: { id: true, fileName: true, uploadedAt: true, parsedAt: true, parsedJson: true },
    });

    if (cached) {
      return NextResponse.json({
        ok: true,
        hasResume: !!latestResume,
        resumeFileName: latestResume?.fileName || null,
        analyzedAt: cached.analyzedAt,
        profile: cached,
      });
    }

    if (!latestResume?.parsedJson) {
      return NextResponse.json({
        ok: true,
        hasResume: !!latestResume,
        resumeFileName: latestResume?.fileName || null,
        analyzedAt: null,
        profile: null,
      });
    }

    const [user, masteryRows] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { xp: true } }),
      prisma.userDomain.findMany({ where: { userId }, select: { domain: true, xp: true }, orderBy: [{ xp: "desc" }] }),
    ]);
    const profile = deriveStage12Profile({
      userId,
      parsedJson: latestResume.parsedJson,
      userXp: Number(user?.xp || 0),
      masteryRows,
    });
    saveStage12Profile(profile);

    return NextResponse.json({
      ok: true,
      hasResume: true,
      resumeFileName: latestResume.fileName || null,
      analyzedAt: profile.analyzedAt,
      profile,
    });
  } catch (err: any) {
    console.error("Stage 12 status load failed", err);
    return NextResponse.json({ error: "Failed to load Stage 12 status" }, { status: 500 });
  }
}
