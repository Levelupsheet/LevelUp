import { requireAdminRequest } from "@/app/api/_lib/adminGuard";
import { prisma } from "@/lib/prisma";
import { readLootVaultRows } from "@/lib/lootVault";
import { listSweepstakesCampaigns } from "@/lib/sweepstakesSql";

export async function GET() {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try {
    const [wallets, inventory, lootBoxes, campaigns, vaultRows] = await Promise.all([
      prisma.wallet.aggregate({ _sum: { tokenBalance: true }, _count: { _all: true } }),
      prisma.inventoryItem.aggregate({ _sum: { quantity: true }, _count: { _all: true } }),
      prisma.lootBox.groupBy({ by: ["status"], _count: { _all: true } }),
      listSweepstakesCampaigns(prisma).catch(() => [] as any[]),
      readLootVaultRows().catch(() => []),
    ]);
    const lootByStatus = Object.fromEntries(lootBoxes.map((row: any) => [String(row.status), Number(row?._count?._all || 0)]));
    const activeCampaigns = (campaigns || []).filter((row: any) => row?.status === "ACTIVE" && row?.isLive).length;
    return Response.json({
      ok: true,
      wallets: Number(wallets?._count?._all || 0),
      tokensInCirculation: Number(wallets?._sum?.tokenBalance || 0),
      inventoryUnits: Number(inventory?._sum?.quantity || 0),
      inventoryRows: Number(inventory?._count?._all || 0),
      loot: { pending: Number(lootByStatus.PENDING || 0), opened: Number(lootByStatus.OPENED || 0), claimed: Number(lootByStatus.CLAIMED || 0) },
      sweepstakes: { activeCampaigns, totalCampaigns: (campaigns || []).length },
      vault: { activeRewards: vaultRows.filter((row) => row.isActive !== false).length, totalRewards: vaultRows.length },
    });
  } catch (error: any) {
    return Response.json({ ok: false, error: error?.message || "Failed to load economy summary" }, { status: 500 });
  }
}
