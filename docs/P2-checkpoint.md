# P2 adaptive learning checkpoint

## Architecture and behavior

GameSession and immutable GameSessionQuestion snapshots are the authoritative attempt history. The shared /api/learning/session path serves training, certification and Test Now; the old Test Now URL remains compatible. Boss runs register active hard-tier question IDs and also contribute graded attempts. The server evaluates stored answers, checks ownership, serializes updates and preserves the first answer on retries. The combat runner saves at feedback, including lethal/final answers, and retries failed saves before NEXT advances.

Saved sessions store learning scope (lane, industry/career, certification or Test Now bank), training mode and exposure cycle. Each cycle completes all currently eligible/unlocked questions before recycling. A partial remainder produces a shorter session. New content joins the current cycle before recycling; adding a question does not cause it to repeat until it catches up with years of historical exposure. Session allocation uses a transaction and a per-user PostgreSQL advisory lock. Remediation has separate cycles so it cannot consume standard unseen allocation.

Learning summaries derive career, pool, domain, subdomain, question, difficulty and supported-format metrics from actual saved answers. No XP-to-mastery substitution or inferred correct answers from reward records remains in the profile. Arbitrary domain IDs and career names remain intact. Selection weighs measured weakness, recency, format balance and authored difficulty after applying eligibility/prerequisites and the unseen cycle. Weak-domain mode requires a measured weak domain, rather than inventing a generic weakness for new users.

Aggregate mastery uses recent per-question evidence, diminishing returns for repetition, distinct-question coverage and hard-tier success. One repeated question cannot establish domain mastery. Individual questions can establish retention with three successful sessions spread over at least 24 hours. A miss resets reinforcement; missed review clears only after three distinct successful sessions and at least 24 hours of reinforcement. Further mistakes reopen it. End-of-session recommendations are scoped to the completed session and reference supported formats and measured performance. The existing HUD displays stored mastery; combat HP/damage and presentation remain intact.

## Additional content preservation fixes

The standalone generation route also preserves earlier generated/reviewed questions and stages new content for review. Generated deletion rejects/archives the record. Approval validates supported content. Fact-bank sync preserves existing live publication while adding pending content and avoids generating duplicates on repeated syncs. Admin review surfaces pedagogical warnings, supports explicit bulk approval, preserves zero-valued Golden bonus XP and retains safe reorder controls. Legacy malformed JSON can be audited without crashing duplicate detection.

## Migration and deployment

20261008050000_learning_sessions adds the LEARNING session mode, optional scope/industry/career fields, explicit training mode, learning cycle and lookup indexes. Existing sessions and question history remain intact. Older sessions retain unknown scope and enter cycle 1; bank selection can include their question IDs when reconciling historical exposure. Their earlier missing career/pool metadata cannot be reconstructed reliably and is labeled legacy in aggregate metrics.

No production database was connected or changed here. Run `npx prisma migrate deploy` and `npx prisma generate` against the deployment environment before enabling the new code. This applies both P1 and P2 migrations (and P0 if still outstanding).

## Validation

- 27 automated tests pass: authoring validation, malformed/duplicate preservation, five-tier combat, reward idempotency, persisted lane integration, cycles and new-content additions, weakness weighting, scoped domain data, mastery/reinforcement, API ownership and retry behavior.
- PGlite PostgreSQL tests apply content and learning migrations twice and verify existing records and preserved import JSON.
- TypeScript `tsc --noEmit` passes.
- Full Next.js production build passes.

API tests use controlled database mocks; migrations execute in PGlite. This does not constitute a production database or browser smoke test.

## Follow-up limits

Content coverage and pedagogical difficulty still need human review. Broad legacy QuestionDomain and certification enums remain schema constraints; arbitrary career-specific domains work through data.domainId/subdomain and GENERAL pools. Historical answers that lacked career/pool scope cannot be assigned a reliable scope retroactively. The existing repository Prisma type shim remains; runtime migrations and Prisma generation are checked separately. Very large histories currently load complete attempt records for summary calculation; materialized aggregate performance work belongs to production hardening. Authenticated saved learning sessions are required for persistence.

## Files changed

- `docs/P1-checkpoint.md`
- `docs/P2-checkpoint.md`
- `prisma/migrations/20261008050000_learning_sessions/migration.sql`
- `prisma/schema.prisma`
- `src/app/api/admin/fact-bank-sync/route.ts`
- `src/app/api/admin/generate-questions/route.ts`
- `src/app/api/admin/generated-questions/route.ts`
- `src/app/api/admin/questions/route.ts`
- `src/app/api/learning/path/route.ts`
- `src/app/api/learning/profile/route.ts`
- `src/app/api/learning/session/route.ts`
- `src/app/api/test-now/session/route.ts`
- `src/components/DiabloQuizRunner.tsx`
- `src/components/GameEngine.tsx`
- `src/components/PracticeMiniGameModal.tsx`
- `src/components/QuestionPipelineAdmin.tsx`
- `src/lib/adaptiveEngine.ts`
- `src/lib/contentPipeline.ts`
- `src/lib/learningEngine.ts`
- `src/lib/learningHistory.ts`
- `src/lib/learningPath.ts`
- `src/lib/questionBank.ts`
- `src/types/prisma-shim.d.ts`
- `tests/adaptive-learning.test.cjs`
- `tests/content-learning-migrations.test.cjs`
- `tests/content-pipeline.test.cjs`
- `tests/game-rewards.test.cjs`
- `tests/learning-session.test.cjs`
