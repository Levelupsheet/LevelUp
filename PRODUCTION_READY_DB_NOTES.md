# Production DB Improvements Included

This update hardens the sweepstakes schema without requiring a separate database.

## Added / improved
- campaign-level live flag: `SweepstakesCampaign.isLive`
- campaign-level weekly cap: `SweepstakesCampaign.entryCapPerUserPerWeek`
- raffle source references: `RaffleEntry.sourceRefType`, `RaffleEntry.sourceRefId`
- raffle dedupe key: `RaffleEntry.auditKey`
- reviewer attribution: `SuspiciousAccountFlag.reviewedBy`

## Why these changes matter
- prevents accidental public activation before launch
- keeps entry logic configurable per campaign
- improves traceability for legal and support review
- reduces risk of duplicate raffle grants from repeated API calls or retries
- helps staff document who reviewed suspicious activity
