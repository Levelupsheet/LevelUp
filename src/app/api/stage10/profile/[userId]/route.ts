import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { levelFromXp, levelTitleFromLevel } from "@/lib/progression";

export async function GET(
  _req: Request,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await context.params;

    const id = String(userId || "").trim();

    if (!id) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const [user, domains, badges] = await Promise.all([
      prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          displayName: true,
          xp: true,
          createdAt: true,
        },
      }),
      prisma.userDomain.findMany({
        where: { userId: id },
        orderBy: [{ xp: "desc" }],
      }),
      prisma.badge.findMany({
        where: { userId: id },
        orderBy: [{ issuedAt: "desc" }],
        take: 10,
      }),
    ]);

    if (!user) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const level = levelFromXp(user.xp || 0);

    return NextResponse.json({
      user: {
        id: user.id,
        displayName: user.displayName || user.id,
        xp: user.xp || 0,
        level,
        rank: levelTitleFromLevel(level),
        createdAt: user.createdAt,
      },
      mastery: domains.map((d) => ({
        domain: d.domain,
        xp: d.xp,
      })),
      achievements: badges.map((b) => ({
        code: b.code,
        label: b.label,
        issuedAt: b.issuedAt,
      })),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Failed to load public profile",
        detail: String(err?.message ?? err),
      },
      { status: 500 }
    );
  }
}