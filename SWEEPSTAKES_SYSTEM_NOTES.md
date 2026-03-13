# Sweepstakes System Notes

## What was added
- Expanded `RaffleEntrySource` to support `GOLDEN_QUESTION`, `GOLDEN_BOSS`, `BOSS_BATTLE`, `CHEST_REWARD`, and `FREE_ENTRY`
- Added `SweepstakesCampaign` for prize pool tracking and winner selection
- Added `FreeEntrySubmission` with verification token flow and captcha verification hook
- Added public sweepstakes summary API and free entry endpoints
- Added admin campaign management and winner draw endpoints
- Updated loot opening and game reward flows to record raffle entry sources in PostgreSQL

## Captcha
This build is ready for Cloudflare Turnstile.

Required env vars:
- `TURNSTILE_SECRET_KEY`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`

Development fallback:
- `captchaToken=dev-pass` works only when `NODE_ENV !== production`

## Email verification
The system stores a verification token and returns a verification URL.
For production, send this link with SES, Resend, Postmark, or Nodemailer.

## Stripe
Historically, Stripe does not charge an upfront fee just to obtain API keys, but transaction pricing can vary by product and region. This package does not add Stripe yet.

## Commands
```bash
npx prisma migrate deploy
npx prisma generate
pm2 restart all
```
