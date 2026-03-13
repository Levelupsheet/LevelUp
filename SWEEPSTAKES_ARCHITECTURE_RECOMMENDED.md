# Sweepstakes Architecture Recommendation

## Keep one PostgreSQL database

Use the same Postgres database for app data and sweepstakes data. Keep the logic in Node.js API routes and services.

### Why this is the right architecture
- user progress, quiz sessions, boss encounters, and raffle entries stay transactionally consistent
- prize pool updates from billing webhooks can update campaign state in one place
- anti-cheat review can join users, quiz attempts, flags, and raffle entries without cross-database sync work
- operational cost stays lower than introducing a second database early

## Recommended logical boundaries

### App data
- `User`
- `UserLearningProfile`
- `UserDomainMastery`
- `UserQuestionHistory`
- `BossEncounter`

### Sweepstakes data
- `SweepstakesCampaign`
- `RaffleEntry`
- `FreeEntrySubmission`
- `PrizePool`

### Security and audit data
- `QuizAttemptAudit`
- `SuspiciousAccountFlag`

## New hardening added in this update

### `SweepstakesCampaign`
- `isLive`: lets you keep campaigns configured in the DB before they are publicly active
- `entryCapPerUserPerWeek`: campaign-level cap control instead of hardcoding the limit forever

### `RaffleEntry`
- `campaignId`: ties every entry to the exact sweepstakes period
- `sourceRefType` + `sourceRefId`: lets you trace each entry back to the originating object
- `auditKey`: dedupes repeated grants for the same earning event
- `meta`: keeps auditable contextual JSON for legal review and support cases

### `SuspiciousAccountFlag`
- `reviewedBy`: records who reviewed a suspicious account or event

## Recommended service flow

```text
Quiz / Boss / Chest / Free Entry
        ↓
Node.js service layer
        ↓
anti-cheat checks
        ↓
awardRaffleEntries()
        ↓
RaffleEntry + audit metadata
        ↓
admin review / draw
```

## Recommended API/service split

- `src/lib/raffle.ts`: raffle awarding, weekly cap enforcement, campaign lookup, draw logic
- `src/lib/antiCheat.ts`: abuse detection, cooldowns, flag creation
- `src/app/api/sweepstakes/*`: public-facing and verification routes
- `src/app/api/admin/sweepstakes/*`: campaign management and winner draw routes
- `src/app/api/stripe/webhook/route.ts`: prize pool contribution updates

## Go-live checklist

1. Run the new Prisma migration.
2. Keep `SWEEPSTAKES_PUBLIC_ENABLED=false` until rules are finalized.
3. Mark only the intended campaign as `isLive=true`.
4. Set the campaign-specific weekly cap if you ever change it from 5.
5. Configure email delivery for free-entry verification.
6. Configure Cloudflare Turnstile in production.
7. Review suspicious flags before any manual winner confirmation.

## Example audit trail

A golden question entry can now be traced as:
- `source = GOLDEN_QUESTION`
- `sourceRefType = SESSION`
- `sourceRefId = <session id>`
- `auditKey = golden:<user id>:<session id>`
- `meta = { lane, title }`

A boss reward can now be traced as:
- `source = GOLDEN_BOSS` or `BOSS_BATTLE`
- `sourceRefType = BOSS_ENCOUNTER`
- `sourceRefId = <boss encounter id>`
- `auditKey = boss:<user id>:<encounter id>`

This makes the system much easier to defend, debug, and audit.
