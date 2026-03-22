# Admin allowlist + Golden Ticket update

## Env vars
Add this to your production `.env`:

```env
ADMIN_EMAIL_WHITELIST=tyrone.rosejr@gmail.com,maxheatt@gmail.com
```

## What changed
- Admin portal and `/api/admin/*` routes now require a logged-in Google account whose email is present in `ADMIN_EMAIL_WHITELIST`.
- Added `/api/auth/google` alias route so the navbar button works directly with the Google OAuth flow.
- Added golden ticket support:
  - one rare golden question can be marked in `/api/content/active`
  - probability increases with `sessionsSinceLastGolden`
  - golden questions return `golden: true` in the question payload
  - a correct golden answer awards **1 weekly raffle entry**
  - weekly limit is capped at **5 entries per user**
- Added Prisma changes:
  - `UserLearningProfile.sessionsSinceLastGolden`
  - `UserLearningProfile.lastGoldenServedAt`
  - `UserQuestionHistory.isGolden`
  - `RaffleEntry` table

## Deploy
```bash
npm install
npx prisma migrate deploy
npx prisma generate
pm2 restart all
```
