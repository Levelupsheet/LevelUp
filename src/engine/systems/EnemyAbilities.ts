export type EnemyAbility = "shield" | "fury" | "restore" | "time";
/** Predictable telegraphed moves, evaluated before an answer is submitted. */
export function enemyAbilityForQuestion(tier: number, answered: number): EnemyAbility | null {
  const turn = answered % 4;
  if (tier >= 5) return (["shield", "fury", "restore", "time"] as const)[turn];
  if (tier === 4) return turn === 1 ? "time" : turn === 3 ? "fury" : null;
  if (tier === 3) return turn === 1 ? "shield" : turn === 3 ? "restore" : null;
  if (tier === 2) return turn === 2 ? "fury" : null;
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
