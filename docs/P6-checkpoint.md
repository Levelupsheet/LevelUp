# P6 data-driven career expansion

CareerCatalog and published QuestionSetPlacement industry/careerPath strings remain the catalog and learner availability sources. Any industry or path can be added through the existing Admin workflow without adding gameplay switches, career enums, UI buttons, or dedicated artwork. Empty/draft careers do not appear as playable paths.

Migration 20261008060000_career_preferences adds nullable selectedIndustry/selectedCareerPath to User, independently of legacy startingPosition (now character appearance only). It adds non-published starter catalog entries spanning Information Technology, Healthcare, Sales, Software Development, Real Estate, Transportation and Industrial/Skilled Trades. Conflicts preserve existing metadata and inactive rows; existing XP, questions, placements and character choices are untouched. Legacy IT path selection remains a compatibility adapter, not the career model.

Authenticated /api/users/career reads/saves only the caller's choice, validates actual published training content, and accepts arbitrary bounded names. Dashboard selection persists to the account before navigation; draft changes do not accidentally replace the saved career. Valid pre-existing local preferences are adopted when no account preference exists. Training loads the account preference across devices and never silently sends a new learner to Help Desk. Unavailable careers prompt reselection.

Existing paid character assets and desktop/mobile HUD geometry are retained. The selected career names the player in training, certification and Test Now; appearance choices are generic Wizard/Barbarian/Assassin. Marketing copy no longer assumes IT. Career-match metadata can carry arbitrary industry/path and is scoped to the saved career so legacy IT recommendations do not spill into unrelated careers. Content readiness still requires reviewed questions and published placements; suggestions are not represented as ready learning banks.

## Final cross-checkpoint verification

Resuming the same active bank preserves HP, remaining timer, streak/momentum, finite enemy inventory and armed player effects; its saved questions are rechecked against currently published content. Inventory activation revalidates question ownership/status under the transaction lock. Reward replay retains deterministic micro/momentum/Fury XP, and Golden styling is tied to the actual server-selected variant, not simply tier five.

38 tests pass, TypeScript passes, Prisma client generation passes and the complete Next.js production build passes. The new career migration was executed twice in isolated PostgreSQL and preserved original XP/catalog rows. No migration or bulk repair was applied to production because no production database connection is configured.

## Deployment and follow-up

Run `npx prisma migrate deploy` and `npx prisma generate` against the intended environment before serving the new preference fields. Review/seed and publish real content for each industry through Admin; new suggestions alone are not content. Perform live DB concurrency and screenshot-based desktop/mobile smoke tests. Old pre-checkpoint sessions lacking consumable receipts may settle conservatively; new sessions use durable receipts. Sweepstakes legal/rules review and interview/job-feed expansion remain later checkpoint work; no paid artwork or CSS files were modified.
