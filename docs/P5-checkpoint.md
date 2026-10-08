# P5 progression and economy checkpoint

## Defined rewards

- Each reached level, including level-one welcome, grants one Bronze chest. Existing LEVEL_UP:n chests count regardless of opened/claimed status.
- Correct answers earn tier XP (15/25/40/55/75), or server-owned boss tier XP. XP Surge multiplies that answer by 1.5. Boss victory adds 100 XP. Server settlement rejects client-supplied XP/count/outcome. Final cross-checkpoint verification also retains deterministic micro/streak bonuses, momentum and Fury XP by replaying graded history; client-only speed bonuses do not mint unverified XP. Reported hint penalties can reduce, never increase, the earned total.
- Tokens: 2 per correct answer, 10 for a perfect run, 8 for surviving completion/victory, 12 extra for boss victory, 6 for a streak of at least 5.
- Boss guaranteed chest, powers and entries remain as defined in P4. Defeat never grants boss victory rewards or Golden-question entries.
- Subscription caps constrain new XP; existing earned XP is never reduced. Active account subscription state determines earning cap; administrators remain uncapped/free for testing.

## Integrity and repairs

XP increments and reconciliation share transactions and per-user locks. A unique per-level RewardClaim replaces the old marker as evidence of a grant; scanning actual source-tagged chests repairs historical gaps even behind an advanced marker. Bulk claims preserve existing chest rows and keep high-level catch-up efficient. Session claims retain the authoritative settlement result for retries and report actual XP added after caps.

Loot claim transitions remain compare-and-set. Raffle drops now mint real entries. Weekly caps and audit-key replay checks are serialized per user. Capped balances remain RAFFLE_ENTRY inventory credits, rather than being lost; historical unminted credits can be redeemed from the loot modal or recovered when claiming later chests. XP chest rewards trigger level reconciliation in the same transaction, and report actual rather than requested XP.

Store purchases and powerup uses have durable action keys. Concurrent retries cannot double-debit or double-consume. Administrator purchases remain free. Character changes enforce authenticated ownership and serialize priced changes. Non-admin browser XP sync no longer creates rewards. Legacy self-authored free-text endpoints retain feedback/history but no longer mint unverifiable XP; certification writes also enforce ownership. Existing question, answer, XP and inventory data is preserved.

## Verification and deployment

34 tests pass, covering historical marker gaps, concurrent level claims, duplicate inventory rows, consumable retries, capped-credit conservation, combat/Golden outcomes, and content/learning migrations. TypeScript and the full Next.js build pass. No production migration or live grants were performed. Catch-up occurs transactionally when the user earns/synchronizes XP or uses /api/loot/earn; no bulk production repair was run.

Remaining: production DB concurrency smoke tests, inventory/raffle monitoring, legal sweepstakes review, and retry keys for any future external payment integration. Approved combat/dashboard asset geometry and CSS are unchanged; the loot modal gains entry-credit redemption.
