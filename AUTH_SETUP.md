# Google Login Setup

Add these values to your EC2 `.env` file:

```env
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_REDIRECT_URI=https://your-domain.com/api/auth/google/callback
AUTH_SECRET=generate-a-long-random-secret
```

Recommended Google Cloud OAuth settings:

- Authorized JavaScript origin: `https://your-domain.com`
- Authorized redirect URI: `https://your-domain.com/api/auth/google/callback`

After updating the env file, run your Prisma migration so the `User` table can store Google profile fields:

```bash
npx prisma migrate deploy
```

Then restart the app process on EC2.
