const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...args) {
  if (request.startsWith('@/')) request = path.join(__dirname, '../src', request.slice(2));
  return resolve.call(this, request, parent, ...args);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, filename);
// These tests exercise planning and reconciliation without a live database.
const prismaPath = path.join(__dirname, '../src/lib/prisma.ts');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: {} } };
const { buildContentPoolCatalog, testNowBanks, trainingPlacementFilter } = require('../src/lib/contentPools.ts');
const { DEFAULT_RULES, inferLevel, computeTierFromMasteryAvg } = require('../src/engine/CombatQuizEngine.ts');
const { buildSessionBlueprint } = require('../src/lib/bankRules.ts');
const { weightedAdaptiveQuestionPlan } = require('../src/lib/adaptiveEngine.ts');
const { reconcileLevelLoot } = require('../src/lib/levelLoot.ts');
const { xpRequiredToReachLevel } = require('../src/lib/progression.ts');
const { incomingEnemyDamage, outgoingEnemyDamage, enemyAbilityForQuestion } = require('../src/engine/systems/EnemyAbilities.ts');
const React = require('react');
const { create, act } = require('react-test-renderer');
const { useCombatQuiz } = require('../src/engine/useCombatQuiz.ts');
let intervalId = 0;
const intervals = new Map();
global.window = { setInterval(fn) { intervals.set(++intervalId, fn); return intervalId; }, clearInterval(id) { intervals.delete(id); } };
async function mountCombat(options) {
  let current;
  function Probe() { current = useCombatQuiz(options); return null; }
  let renderer;
  await act(async () => { renderer = create(React.createElement(Probe)); });
  return { get value() { return current; }, async run(fn) { await act(async () => { fn(current); await Promise.resolve(); }); }, async close() { await act(async () => renderer.unmount()); } };
}
const question = (level, id = `q${level}`) => ({ id, prompt: 'Choose A', level, choices: ['A','B'], correctIndex: 0 });

test('active catalog includes published sets, deduplicates placements, distinguishes Mixed and General', () => {
  const set = (id, domain, questions = 10) => ({ id, domain, status: 'PUBLISHED', _count: { questions } });
  const catalog = buildContentPoolCatalog([
    { lane: 'TEST_NOW', isActive: true, setId: 's', set: set('s', 'STORAGE') },
    { lane: 'TEST_NOW', isActive: true, setId: 's', set: set('s', 'STORAGE') },
    { lane: 'TEST_NOW', isActive: true, setId: 'g', set: set('g', 'GENERAL', 5) },
    { lane: 'TEST_NOW', isActive: true, setId: 'draft', set: { ...set('draft','AWS'), status:'DRAFT' } },
    { lane: 'TEST_NOW', isActive: false, setId: 'x', set: set('x','AZURE') },
    { lane: 'TRAINING', isActive: true, startingPosition: 'HELPDESK_SUPPORT', setId: 'h', set: set('h','GENERAL') },
    { lane: 'TRAINING', isActive: true, industry: 'Information Technology', careerPath: 'Help Desk', setId: 'h', set: set('h','GENERAL') },
  ]);
  assert.deepEqual(testNowBanks(catalog).map(b => [b.domain, b.questionCount]), [['MIXED',15], ['GENERAL',5], ['STORAGE',10]]);
  const training = catalog.find(p => p.lane === 'TRAINING');
  assert.equal(training.poolCount, 1);
  assert.deepEqual(trainingPlacementFilter(training).OR[1], { startingPosition: 'HELPDESK_SUPPORT', careerPath: null });
  assert.deepEqual(trainingPlacementFilter({ industry: 'Healthcare', careerPath: 'Nursing' }), { industry: 'Healthcare', careerPath: 'Nursing' });
});

test('planner selects actual questions across all five tiers without relabeling difficulty', () => {
  const questions = Array.from({ length: 5 }, (_, i) => Array.from({ length: 5 }, (_, j) => ({ ...question(i+1, `q${i+1}-${j}`), type: 'multiple_choice', domainId: 'general', difficulty: i+1 }))).flat();
  const blueprint = buildSessionBlueprint(15, 1);
  assert.deepEqual(blueprint.map(s => s.difficulty), [1,1,1,2,2,2,3,3,3,4,4,4,5,5,5]);
  const learning = { masteryByDomain: {}, masteryBySubdomain: {}, masteryByQuestionType: {}, recentHistory: [], recentQuestionIds: new Set(), exposureQuestionIds24h: new Set(), weakestTargetDifficulty: 1, weakestDomain: 'general' };
  const picked = weightedAdaptiveQuestionPlan({ questions, questionCount: 15, learning, blueprint });
  assert.deepEqual(picked.map(q => q.level), blueprint.map(s => s.difficulty));
  assert.equal(new Set(picked.map(q => q.id)).size, 15);
  for (const q of picked) assert.equal(q.level, questions.find(source => source.id === q.id).level);
  const sparse = weightedAdaptiveQuestionPlan({ questions: [question(1), question(5)], questionCount: 15, learning, blueprint });
  assert.deepEqual(sparse.map(q => q.level).sort(), [1,5]);
});

test('five-tier tables remain finite and mastery promotion has hysteresis', () => {
  for (let tier = 1; tier <= 5; tier++) {
    assert.equal(inferLevel(question(tier)), tier);
    for (const name of ['xpByTier','timePerQuestionByTier','playerDamageByTier','enemyDamageByTier']) assert.ok(Number.isFinite(DEFAULT_RULES[name][tier]));
  }
  assert.equal(computeTierFromMasteryAvg(92, 5, DEFAULT_RULES), 5);
  assert.equal(computeTierFromMasteryAvg(84, 4, DEFAULT_RULES), 4);
  assert.equal(computeTierFromMasteryAvg(20, 5, DEFAULT_RULES), 1);
  assert.deepEqual([1,2,3,4,5].map(t => incomingEnemyDamage(DEFAULT_RULES.playerDamageByTier[t], false, 1)), [8,12,16,20,24]);
  assert.equal(incomingEnemyDamage(24,true,3), 0);
  assert.equal(outgoingEnemyDamage(34,true,false), 68);
  assert.equal(outgoingEnemyDamage(34,false,true), 17);
  assert.equal(enemyAbilityForQuestion(1,2), null);
  assert.equal(enemyAbilityForQuestion(5,3), 'time');
});

test('combat preserves HP across questions, reports actual damage, and does not apply mastery tier to easier questions', async () => {
  const submitted = [];
  const combat = await mountCombat({ questions: [question(1), question(5)], finishOnEnemyDefeat: false, initialState: { tier: 5 }, onSubmit: r => submitted.push(r) });
  await combat.run(c => { c.select(1); });
  await combat.run(c => c.submit());
  assert.equal(combat.value.state.playerHP, 92);
  assert.equal(submitted[0].playerDamage, 8);
  await combat.run(c => c.next());
  assert.equal(combat.value.state.playerHP, 92);
  await combat.run(c => c.select(1));
  await combat.run(c => c.submit());
  assert.equal(combat.value.state.playerHP, 68);
  assert.equal(submitted[1].playerDamage, 24);
  await combat.close();
});

test('shield blocks one question and fury applies damage; healing clamps to maximum', async () => {
  const modifiers = { shieldActive: true, furyActive: true };
  const results = [];
  const combat = await mountCombat({ questions: [question(5,'a'),question(5,'b')], finishOnEnemyDefeat: false, getActiveModifiers: () => modifiers, onConsumeModifier: key => { modifiers[key] = false; }, onSubmit: r => results.push(r) });
  await combat.run(c => c.select(1)); await combat.run(c => c.submit());
  assert.equal(combat.value.state.playerHP,100); assert.equal(results[0].usedShield,true); assert.equal(results[0].playerDamage,0);
  await combat.run(c => c.next()); await combat.run(c => c.select(0)); await combat.run(c => c.submit());
  assert.equal(results[1].enemyDamage,80); assert.equal(modifiers.furyActive,false);
  await combat.run(c => c.restorePlayerHP(500)); assert.equal(combat.value.state.playerHP,100);
  await combat.close();
});

test('lethal timeout locks feedback and finishes without allowing healing or advancement', async () => {
  const combat = await mountCombat({ questions: [question(5,'timeout'),question(1,'next')], timed: true, initialState: { playerHP: 10 }, finishOnEnemyDefeat: false });
  for (let i=0;i<20;i++) await combat.run(() => { for (const tick of [...intervals.values()]) tick(); });
  assert.equal(combat.value.state.playerHP,0); assert.equal(combat.value.state.finished,true); assert.equal(combat.value.state.locked,true); assert.equal(combat.value.state.feedback,"Time's up.");
  await combat.run(c => c.restorePlayerHP(100)); await combat.run(c => c.next());
  assert.equal(combat.value.state.playerHP,0); assert.equal(combat.value.state.idx,0);
  await combat.close();
});

function lootFixture(marker = 11, sources = []) {
  const user = { id:'u', xp:xpRequiredToReachLevel(12), lootGrantedUpToLevel:marker };
  const boxes = sources.map(source => ({ source }));
  return { user, boxes, tx: {
    user: { async findUnique() { return { ...user }; }, async updateMany({where,data}) { if (user.lootGrantedUpToLevel !== where.lootGrantedUpToLevel) return {count:0}; Object.assign(user,data); return {count:1}; } },
    lootBox: { async findMany() { return [...boxes]; }, async createMany({data}) { boxes.push(...data); } },
    notification: { async deleteMany() {}, async create() {} },
  } };
}
test('level 12 chest catch-up is idempotent under concurrent requests', async () => {
  const { user, boxes, tx } = lootFixture();
  const rewards = await Promise.all([reconcileLevelLoot(tx,'u'), reconcileLevelLoot(tx,'u')]);
  assert.equal(rewards.reduce((sum,r)=>sum+r.created,0),1); assert.equal(boxes.length,1); assert.equal(boxes[0].source,'LEVEL_UP:12'); assert.equal(user.lootGrantedUpToLevel,12);
  assert.equal((await reconcileLevelLoot(tx,'u')).created,0);
});
test('legacy level-tagged chests are preserved without granting duplicates', async () => {
  const { boxes, tx } = lootFixture(10,['LEVEL_UP:11','LEVEL_UP:12']);
  assert.equal((await reconcileLevelLoot(tx,'u')).created,0); assert.equal(boxes.length,2);
});

const { awardGoldenQuestion } = require('../src/lib/goldenRewards.ts');
test('Golden reward reservation prevents simultaneous duplicate awards and reports capped grants honestly', async () => {
  let reserved = false, grants = 0, notifications = 0;
  const tx = {
    async $queryRawUnsafe() { if (reserved) return []; reserved = true; return [{id:'history'}]; },
    async $executeRawUnsafe() { reserved = false; },
    notification: { async create() { notifications++; } },
  };
  const args = { userId:'u',sessionId:'s',questionId:'q',campaignId:'c' };
  const grant = async (_, input) => { assert.equal(input.auditKey,'golden-question:q:s'); grants++; return {awarded:1}; };
  const results = await Promise.all([awardGoldenQuestion(tx,args,grant),awardGoldenQuestion(tx,args,grant)]);
  assert.equal(results.filter(Boolean).length,1); assert.equal(grants,1); assert.equal(notifications,1);
  reserved=false;
  assert.equal(await awardGoldenQuestion(tx,args,async()=>({awarded:0})),false);
  assert.equal(reserved,false);
});
