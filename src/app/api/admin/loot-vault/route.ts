import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/app/api/_lib/adminGuard";
import { readLootVaultRows, writeLootVaultRows } from "@/lib/lootVault";

export async function GET() {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try {
    const rows = await readLootVaultRows();
    return NextResponse.json({ ok: true, rows });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Failed to load loot vault rewards" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try {
    const body = await req.json().catch(() => ({} as any));
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    await writeLootVaultRows(rows);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Failed to save loot vault rewards" }, { status: 500 });
  }
}
