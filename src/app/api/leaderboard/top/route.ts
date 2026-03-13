import { NextResponse } from "next/server";
import { prisma } from "@/app/api/_lib/prisma";

// Ensure this endpoint is never statically cached.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Top candidates leaderboard (minimal v1)
// Returns the top 3 users by XP.

function levelFromXp(xp: number) {
  const safe = Number.isFinite(xp) ? xp : 0;
  return Math.floor(safe / 500) + 1;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const metric = (url.searchParams.get("metric") || "top") as "top" | "active" | "improved";

    const orderBy =
      metric === "active"
        ? ([{ lastActiveAt: "desc" as const }, { xp: "desc" as const }, { createdAt: "asc" as const }] as const)
        : ([{ xp: "desc" as const }, { createdAt: "asc" as const }] as const);

    // NOTE:
    // Some flows award XP via activity logs before (or in addition to) a server write
    // to User.xp. To prevent the leaderboard from showing 0 XP for active users,
    // we compute an "effective" XP as the max of:
    //   - User.xp
    //   - Sum(PracticeAnswer.xpAwarded)
    //   - Sum(CertPracticeAnswer.xpAwarded)
    //   - Sum(LootDrop.quantity where XP_BOOST and LootBox.status=CLAIMED)
    // This keeps the leaderboard accurate even if the user XP column lags.

    const users = await prisma.user.findMany({
      take: 25,
      orderBy,
      select: {
        id: true,
        displayName: true,
        xp: true,
        rank: true,
        createdAt: true,
        lastActiveAt: true,
      },
    });

    const withEffective = await Promise.all(
      users.map(async (u) => {
        const [practiceAgg, certAgg, lootAgg, sessionPenaltyAgg] = await Promise.all([
          prisma.practiceAnswer.aggregate({
            where: { userId: u.id },
            _sum: { xpAwarded: true },
          }),
          prisma.certPracticeAnswer.aggregate({
            where: { userId: u.id },
            _sum: { xpAwarded: true },
          }),
          prisma.lootDrop.aggregate({
            where: {
              rewardType: "XP_BOOST",
              lootBox: { userId: u.id, status: "CLAIMED" },
            },
            _sum: { quantity: true },
          }),
          prisma.gameSession.aggregate({
            where: { userId: u.id },
            _sum: { leaderboardPenalty: true },
          }),
        ]);

        const xpUser = u.xp ?? 0;
        const xpPractice = practiceAgg._sum.xpAwarded ?? 0;
        const xpCert = certAgg._sum.xpAwarded ?? 0;
        const xpLoot = lootAgg._sum.quantity ?? 0;
        const xpPenalty = sessionPenaltyAgg._sum.leaderboardPenalty ?? 0;
        const xpEffective = Math.max(0, Math.max(xpUser, xpPractice + xpCert + xpLoot) - xpPenalty);

        return {
          id: u.id,
          displayName: u.displayName ?? u.id,
          xp: xpEffective,
          level: levelFromXp(xpEffective),
          rank: u.rank,
          lastActiveAt: u.lastActiveAt,
          createdAt: u.createdAt,
        };
      })
    );

    // Resort by metric using effective XP
    const sorted = [...withEffective].sort((a, b) => {
      if (metric === "active") {
        const ad = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
        const bd = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
        if (bd !== ad) return bd - ad;
        if (b.xp !== a.xp) return b.xp - a.xp;
        return String(a.createdAt).localeCompare(String(b.createdAt));
      }
      // "improved" is a UI tab for now; treat as top.
      if (b.xp !== a.xp) return b.xp - a.xp;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    });

    const top = sorted.slice(0, 3).map((u) => ({
      id: u.id,
      displayName: u.displayName,
      xp: u.xp,
      level: u.level,
      rank: u.rank,
    }));

    // "improved" is a UI tab for now (we'll compute true deltas once XP history exists)
    return NextResponse.json({ top, metric });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to load leaderboard", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
