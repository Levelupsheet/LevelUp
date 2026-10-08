export type EnemyAbility = "shield" | "fury" | "restore" | "time";
export type EnemyInventory = Record<EnemyAbility, number>;
export type EnemyProfile = { name: string; tier: number; maxHP: number; inventory: EnemyInventory };
export const EMPTY_ENEMY_INVENTORY: EnemyInventory = { shield: 0, fury: 0, restore: 0, time: 0 };
export function createEnemyProfile(name: string, tier: number, maxHP: number, loadout?: Partial<EnemyInventory>): EnemyProfile {
  const inventory = { ...EMPTY_ENEMY_INVENTORY, ...(tier >= 4 ? { shield: 1, fury: 1, time: 1, restore: tier >= 5 ? 1 : 0 } : {}), ...loadout };
  for (const ability of Object.keys(inventory) as EnemyAbility[]) inventory[ability] = Math.max(0, Math.min(10, Math.floor(Number(inventory[ability]) || 0)));
  if (name.toLowerCase() === "ticket gremlin" && tier <= 3) Object.assign(inventory, EMPTY_ENEMY_INVENTORY);
  return { name, tier, maxHP: Math.max(1, Math.floor(maxHP)), inventory };
}
export function nextEnemyAbility(inventory?: EnemyInventory | null): EnemyAbility | null {
  return (["shield", "fury", "restore", "time"] as EnemyAbility[]).find(a => Number(inventory?.[a] || 0) > 0) || null;
}
export function consumeEnemyAbility(inventory: EnemyInventory, ability: EnemyAbility | null): EnemyInventory {
  return ability ? { ...inventory, [ability]: Math.max(0, inventory[ability] - 1) } : inventory;
}
export function combatDamageScale(questionTier: number, enemyTier: number) {
  return Math.max(0.6, Math.min(1.4, 1 + (questionTier - enemyTier) * 0.1));
}
/** Predictable telegraphed moves, evaluated before an answer is submitted. */
export function enemyAbilityForQuestion(tier: number, answered: number): EnemyAbility | null {
  const turn = answered % 4;
  if (tier >= 5) return (["shield", "fury", "restore", "time"] as const)[turn];
  if (tier === 4) return turn === 1 ? "time" : turn === 3 ? "fury" : null;
  // Basic enemies have no automatic powers. Actual combat uses a finite loadout.
  return null;
}
export function incomingEnemyDamage(stageDamage: number, shielded: boolean, multiplier: unknown): number {
  if (shielded) return 0;
  const value = Number(multiplier);
  const scale = Number.isFinite(value) && value > 0 ? Math.min(3, value) : 1;
  return Math.max(1, Math.round(stageDamage * scale));
}
export function outgoingEnemyDamage(baseDamage: number, fury: boolean, shield: boolean): number {
  return Math.max(0, Math.ceil(baseDamage * (fury ? 2 : 1) * (shield ? 0.5 : 1)));
}
