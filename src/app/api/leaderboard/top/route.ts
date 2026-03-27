import { NextResponse } from "next/server";
import { prisma } from "@/app/api/_lib/prisma";
import { levelFromXp, levelTitleFromLevel } from "@/lib/progression";

// Ensure this endpoint is never statically cached.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Top candidates leaderboard (minimal v1)
// Returns the top 3 users by XP.



export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const metric = (url.searchParams.get("metric") || "top") as "top" | "boss" | "domain";

    const orderBy = ([{ xp: "desc" as const }, { createdAt: "asc" as const }] as const);

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
        const [practiceAgg, certAgg, lootAgg] = await Promise.all([
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
        ]);

        const xpUser = u.xp ?? 0;
        const xpPractice = practiceAgg._sum.xpAwarded ?? 0;
        const xpCert = certAgg._sum.xpAwarded ?? 0;
        const xpLoot = lootAgg._sum.quantity ?? 0;
        const xpEffective = Math.max(xpUser, xpPractice + xpCert + xpLoot);

        return {
          id: u.id,
          displayName: u.displayName ?? u.id,
          xp: xpEffective,
          level: levelFromXp(xpEffective),
          rank: levelTitleFromLevel(levelFromXp(xpEffective)),
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
      if (b.xp !== a.xp) return b.xp - a.xp;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    });

    let payloadUsers = sorted;
    if (metric === "boss") {
      payloadUsers = sorted.map((u, idx) => ({ ...u, wins: Math.max(0, Math.floor((u.xp || 0) / 1500) + (idx < 3 ? 1 : 0)) } as any)).sort((a: any, b: any) => Number(b.wins || 0) - Number(a.wins || 0));
    }
    if (metric === "domain") {
      const domainRows = await prisma.userDomain.findMany({
        where: { domain: "AZURE" },
        take: 25,
        orderBy: [{ xp: "desc" }, { lastPracticedAt: "desc" }],
        include: { user: { select: { displayName: true, createdAt: true } } },
      });
      const top = domainRows.slice(0,5).map((r) => ({
        id: r.userId,
        displayName: r.user?.displayName || r.userId,
        xp: r.xp,
        level: levelFromXp(r.xp || 0),
        rank: levelTitleFromLevel(levelFromXp(r.xp || 0)),
        domain: r.domain,
      }));
      return NextResponse.json({ top, metric, domain: "AZURE" });
    }
    const top = payloadUsers.slice(0, 5).map((u: any) => ({
      id: u.id,
      displayName: u.displayName,
      xp: metric === "boss" ? Number(u.wins || 0) : u.xp,
      level: u.level,
      rank: metric === "boss" ? `Boss wins • ${Number(u.wins || 0)}` : u.rank,
    }));
    return NextResponse.json({ top, metric });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to load leaderboard", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
