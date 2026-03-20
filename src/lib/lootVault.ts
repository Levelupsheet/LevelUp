import fs from "fs/promises";
import path from "path";

export type LootVaultRow = {
  id: string;
  name: string;
  type: string;
  costTokens: number;
  description: string;
  isActive?: boolean;
  sweepstakesEntries?: number;
  fulfillmentUrl?: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "loot-vault.json");

export const DEFAULT_LOOT_VAULT: LootVaultRow[] = [
  { id: "sweep-entry-1", name: "1 Sweepstakes Entry", type: "SWEEPSTAKES_ENTRY", costTokens: 100, description: "Convert tokens into one sweepstakes entry.", isActive: true, sweepstakesEntries: 1 },
  { id: "sweep-entry-5", name: "5 Sweepstakes Entries", type: "SWEEPSTAKES_ENTRY", costTokens: 450, description: "Bundle entry option for active campaigns.", isActive: true, sweepstakesEntries: 5 },
  { id: "cashout-5", name: "$5 Cash-Out Reward", type: "CASH_OUT", costTokens: 500, description: "Manual reward fulfillment for small-value cash redemption.", isActive: true },
  { id: "merch-mousepad", name: "LevelUp Pro Mousepad", type: "MERCH", costTokens: 700, description: "Redeem for official LevelUp Pro merch.", isActive: true },
];

function normalizeRow(row: any, index = 0): LootVaultRow {
  return {
    id: String(row?.id || `loot-${index+1}`),
    name: String(row?.name || "Untitled reward"),
    type: String(row?.type || "SWEEPSTAKES_ENTRY").toUpperCase(),
    costTokens: Math.max(0, Number(row?.costTokens ?? 0) || 0),
    description: String(row?.description || ""),
    isActive: row?.isActive === undefined ? true : Boolean(row.isActive),
    sweepstakesEntries: row?.sweepstakesEntries == null ? undefined : Math.max(0, Number(row.sweepstakesEntries) || 0),
    fulfillmentUrl: row?.fulfillmentUrl ? String(row.fulfillmentUrl) : undefined,
  };
}

export async function readLootVaultRows(): Promise<LootVaultRow[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeRow) : DEFAULT_LOOT_VAULT.map(normalizeRow);
  } catch {
    return DEFAULT_LOOT_VAULT.map(normalizeRow);
  }
}

export async function writeLootVaultRows(rows: LootVaultRow[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const normalized = (Array.isArray(rows) ? rows : []).map(normalizeRow);
  await fs.writeFile(DATA_FILE, JSON.stringify(normalized, null, 2), "utf8");
}
