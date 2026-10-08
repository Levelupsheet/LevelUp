# LevelUp Pro P0 handoff

## Architecture found

Learner availability used different rules across the active-bank loader, career endpoint, Test Now bank listing, hard-coded certification buttons, and Admin Live Pools. Some APIs served active draft sets while others required publication. Legacy role placements and industry/career placements could overlap. The adaptive planner clamped to three tiers and relabeled questions. Combat stored enemy HP separately from the hook. GameEngine omitted the required session reward claim key, and level reward paths did not share one grant marker.

## Result

Active QuestionSetPlacement records attached to PUBLISHED QuestionSet records determine access. Shared contentPools/activePools helpers power the learner catalog, career list, Test Now banks, certification catalog, and Admin placement summaries. Admin Live Pools applies the same visibility rule and retains per-set question inspection and unpublishing. Mixed aggregates active Test Now banks; GENERAL remains a distinct selectable bank. Publishing validates a nonempty set, publishes the set and placement in one transaction, and replaces only the selected career/exam/Test Now domain when requested. Unpublishing changes the placement without deleting questions.

Training writes use canonical Industry → Career Path targets. Legacy role reads remain compatible during rollout. The migration moves Help Desk, Desktop Technician and Cloud Engineer to Information Technology, clears obsolete lane filters, deactivates duplicate live placements, and adds partial unique indexes preventing concurrent duplicate publication. New publication reuses matching placement records.

Multi Select and other inactive formats no longer appear in coverage recommendations or composition targets. Historical content remains saved.

Golden selection marks an already-selected eligible advanced question instead of injecting seen questions or marking easy questions Golden. Eligibility no longer silently changes authored difficulty. Campaign disable flags are respected. Reward reservation and entry grants share one transaction; failed or capped grants do not report success. Level-up rewards use saved server XP and an atomic level marker, preserve old LEVEL_UP:n grants, and catch up missed levels without granting them again.

The previously authorized combat work also carries difficulty 1–5 through selection, XP, timers and damage. Enemy tiers follow actual question difficulty. Base incoming damage is 8/12/16/20/24 HP, with shield and ability multipliers. Enemy health uses one state value; lethal timeouts keep feedback visible and cannot be healed back into a live run. Question-scoped shields/fury and visible enemy ability cues are preserved. No dashboard or combat HUD styling redesign was performed.

## Migration and deployment

Added `prisma/migrations/20261008023000_canonical_live_placements/migration.sql`.

Executed the exact SQL against an isolated PostgreSQL-compatible PGlite database with legacy/dynamic duplicates, inactive placements and unpublished content. The test runs the migration twice, verifies preserved rows and canonical paths, and verifies duplicate publication is rejected.

**Not applied to production:** no production DATABASE_URL or server connection is available here. Run the repository's deployment process with:

```sh
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
```

The migration assumes the existing career-path/catalog migrations are applied; `migrate deploy` applies pending migrations in order. Draft or archived sets are intentionally hidden from learners even if their old placement is active. Republish intended pools through Admin rather than implicitly publishing production drafts.

## Validation

- Full `npm run build`: passed, including Next.js type validation and prerendering.
- `npm test`: 11 passing regressions (catalog visibility, five-tier planning, mastery hysteresis, HP persistence, shield/fury, lethal timeout, claim-key submission, level reward catch-up/concurrency, legacy rewards, Golden reward concurrency, and PostgreSQL migration).
- `git diff --check`: passed.
- Repaired the package lock so missing document-import dependencies are included; added test-only React renderer and PGlite dependencies.

## Remaining checks

Live authenticated DB/UI verification is still required after deployment. Confirm that each intended active set is published, inspect every pool from Admin, and test learner selections for all three modes. Advanced/boss/Golden content requires real authored tier 4–5 questions; absent tiers do not cause fabricated replacements. Pool counts show saved questions; lifecycle, format, prerequisite, deduplication and unseen-cycle rules can reduce the number served in a session. Further content/editor quality work, learning tuning, boss cooldowns, broader economy hardening, and visual QA remain later checkpoints in the supplied roadmap.

## Files changed

- `package-lock.json`
- `package.json`
- `prisma/migrations/20261008023000_canonical_live_placements/migration.sql`
- `src/app/admin/content/page.tsx`
- `src/app/admin/page.tsx`
- `src/app/api/admin/analytics/coverage/route.ts`
- `src/app/api/admin/fact-bank-sync/route.ts`
- `src/app/api/admin/golden-tracking/route.ts`
- `src/app/api/admin/placements/route.ts`
- `src/app/api/admin/publish-questions/route.ts`
- `src/app/api/admin/questions/route.ts`
- `src/app/api/career-paths/route.ts`
- `src/app/api/content/active/route.ts`
- `src/app/api/content/pools/route.ts`
- `src/app/api/game/session/route.ts`
- `src/app/api/loot/earn/route.ts`
- `src/app/api/test-now/banks/route.ts`
- `src/app/api/test-now/session/route.ts`
- `src/app/cert-mcq/page.tsx`
- `src/app/certifications/page.tsx`
- `src/app/position-training/page.tsx`
- `src/app/test-now/page.tsx`
- `src/components/DiabloQuizRunner.tsx`
- `src/components/GameEngine.tsx`
- `src/components/PracticeMiniGameModal.tsx`
- `src/engine/CombatQuizEngine.ts`
- `src/engine/constants/gameConfig.ts`
- `src/engine/stage8/RetentionSystem.ts`
- `src/engine/systems/DifficultySystem.ts`
- `src/engine/systems/EnemyAbilities.ts`
- `src/engine/systems/XPSystem.ts`
- `src/engine/useCombatQuiz.ts`
- `src/lib/activePools.ts`
- `src/lib/adaptiveEngine.ts`
- `src/lib/bankRules.ts`
- `src/lib/bossBattle.ts`
- `src/lib/contentPools.ts`
- `src/lib/goldenRewards.ts`
- `src/lib/learningProfile.ts`
- `src/lib/levelLoot.ts`
- `src/lib/questionBank.ts`
- `src/lib/useContentPools.ts`
- `tests/game-rewards.test.cjs`
- `tests/learning-combat.test.cjs`
- `tests/placement-migration.test.cjs`
- `docs/P0-checkpoint.md`
