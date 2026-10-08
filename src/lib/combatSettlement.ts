import { GAME_CONFIG } from "@/engine/constants/gameConfig";
import { createEnemyProfile, nextEnemyAbility, consumeEnemyAbility, incomingEnemyDamage, outgoingEnemyDamage, combatDamageScale } from "@/engine/systems/EnemyAbilities";

/** Replay immutable server-graded answers and durable item uses, never client HP/XP/outcome. */
export function settleCombat(session: any, itemUses: any[]) {
  const boss = session.trainingMode === "BOSS" ? session.stateJson?.boss : null;
  const rows = [...(session.questions || [])].sort((a,b) => a.orderIndex - b.orderIndex);
  let playerHP = 100, enemyHP = 0, tier = 0, correctCount = 0, xpEarned = 0, bestStreak = 0, streak = 0, answeredCount = 0;
  let enemy = createEnemyProfile("Enemy", 1, 90);
  for (const row of rows) {
    if (!row.answered || playerHP <= 0 || (boss && enemyHP <= 0 && answeredCount > 0)) break;
    const q = row.payloadJson || {};
    const level = Math.max(1,Math.min(5,Number(q.level || q.difficulty || 1))) as 1|2|3|4|5;
    const nextTier = boss ? 5 : level;
    if (nextTier !== tier) {
      tier = nextTier;
      enemy = createEnemyProfile("Enemy", tier, boss ? boss.rules.enemyMaxHP : 90 + (tier - 1) * 20);
      enemyHP = enemy.maxHP;
    }
    const used = (id: string) => itemUses.some(claim => claim.meta?.itemId === id && claim.claimKey === `use-item:${session.userId}:${row.id}:${id}:`);
    if (used("health_restore")) playerHP = Math.min(100,playerHP + 25);
    const ability = nextEnemyAbility(enemy.inventory);
    if (row.isCorrect) {
      correctCount++; streak++; bestStreak = Math.max(bestStreak,streak);
      const base = boss ? boss.rules.enemyDamageByTier[level] : Math.ceil(enemy.maxHP / 3);
      enemyHP = Math.max(0,enemyHP - outgoingEnemyDamage(base,used("fury_charge"),ability === "shield" || Boolean(q.data?.blockNextCorrect)));
      xpEarned += Math.round((boss ? boss.rules.xpByTier[level] : GAME_CONFIG.xpByTier[level]) * (used("xp_surge") ? 1.5 : 1));
    } else {
      streak = 0;
      const base = boss ? boss.rules.playerDamageByTier[level] : GAME_CONFIG.playerDamageByTier[tier as 1|2|3|4|5];
      playerHP = Math.max(0,playerHP - incomingEnemyDamage(base,used("shield_charge"),combatDamageScale(level,tier) * Number(q.data?.playerDamageMultiplier || 1) * (ability === "fury" ? 1.5 : 1)));
      if (ability === "restore" && enemyHP > 0) enemyHP = Math.min(enemy.maxHP,enemyHP + Math.ceil(enemy.maxHP * .1));
      if (playerHP <= 0 && boss && used("extra_life")) playerHP = 25;
    }
    enemy.inventory = consumeEnemyAbility(enemy.inventory,ability);
    answeredCount++;
  }
  const finished = playerHP <= 0 || (boss && enemyHP <= 0 && answeredCount > 0) || answeredCount === rows.length;
  const outcome = playerHP <= 0 ? "defeat" : boss ? enemyHP <= 0 ? "victory" : "defeat" : "complete";
  return { finished, outcome, playerHP, enemyHP, correctCount, totalQuestions: rows.length, answeredCount, xpEarned, bestStreak, boss };
}
