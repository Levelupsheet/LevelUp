# Sweepstakes drop-in guide

This build includes a prelaunch-ready sweepstakes system with:
- raffle entry tracking in PostgreSQL
- per-user weekly cap of 5 entries
- source tracking for golden questions, boss battles, chest rewards, and free entry
- captcha-backed free entry verification flow
- admin winner draw endpoint for the active campaign
- prize pool tracking hooks

## Prelaunch safety switch

Add this to `.env`:

```env
SWEEPSTAKES_PUBLIC_ENABLED=false
```

When set to `false`:
- the sweepstakes page still shows totals and status
- the free entry form is disabled for public users
- admin preview still works while signed in with a whitelisted Google email

## Main tables

### raffle_entries
- `id`
- `user_id`
- `campaign_id`
- `source`
- `quantity`
- `week_start`
- `created_at`
- `meta`

### free_entry_submissions
- `id`
- `campaign_id`
- `user_id`
- `email`
- `normalized_email`
- `verification_token`
- `verification_expires_at`
- `verified_at`
- `created_at`

### sweepstakes_campaigns
- `id`
- `slug`
- `title`
- `status`
- `starts_at`
- `ends_at`
- `prize_pool_cents`
- `winner_entry_id`
- `winner_user_id`
- `drawn_at`

## Core routes
- `GET /api/sweepstakes/summary`
- `POST /api/sweepstakes/free-entry`
- `GET /api/sweepstakes/free-entry/verify`
- `POST /api/admin/sweepstakes/campaign`
- `POST /api/admin/sweepstakes/draw`

## Example SQL queries

### Total entries in active campaign
```sql
SELECT COALESCE(SUM(quantity), 0) AS total_entries
FROM "RaffleEntry"
WHERE "campaignId" = $1;
```

### User entries this week
```sql
SELECT COALESCE(SUM(quantity), 0) AS weekly_entries
FROM "RaffleEntry"
WHERE "userId" = $1
  AND "weekStart" = $2;
```

### Entry breakdown by source
```sql
SELECT source, COALESCE(SUM(quantity), 0) AS total_entries
FROM "RaffleEntry"
WHERE "campaignId" = $1
GROUP BY source
ORDER BY total_entries DESC;
```

### Random winner draw (application-side weighted draw is preferred)
```sql
SELECT *
FROM "RaffleEntry"
WHERE "campaignId" = $1
ORDER BY random()
LIMIT 1;
```

## Go-live checklist
1. Finalize sweepstakes rules and disclosures.
2. Configure Turnstile keys.
3. Set real `APP_BASE_URL`.
4. Set `SWEEPSTAKES_PUBLIC_ENABLED=true`.
5. Restart the app.
