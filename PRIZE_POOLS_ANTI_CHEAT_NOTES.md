# Prize Pools + Anti-Cheat Notes

## What was added
- `PrizePool` table for live sweepstakes pool tracking
- Stripe-ready webhook endpoint at `/api/stripe/webhook`
- 15% subscription contribution flow into `WEEKLY_GOLDEN_POOL`
- `QuizAttemptAudit` for account/IP/device quiz session logging
- `SuspiciousAccountFlag` for reviewable anti-abuse flags
- `UserLearningProfile.antiCheatCooldownUntil`
- `UserLearningProfile.suspiciousScore`
- `/api/admin/security/flags` admin review endpoint

## Stripe webhook events supported
- `invoice.payment_succeeded`
- `checkout.session.completed`

## Anti-cheat behavior
- account quiz attempt rate limiting
- IP quiz attempt rate limiting
- rapid answer detection
- device fingerprint reuse flagging
- Turnstile captcha escalation when suspicious
- account cooldown when blocked or high-risk

## Required env
- `STRIPE_WEBHOOK_SECRET`
- `TURNSTILE_SECRET_KEY`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`

## Deploy
```bash
npx prisma migrate deploy
npx prisma generate
pm2 restart all
```
