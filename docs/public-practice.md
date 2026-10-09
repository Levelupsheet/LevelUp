# Public practice launcher

`/learn` lists active, published, learner-ready career, certification, and Test Now banks. Landing-page Start Free opens this launcher. `/certifications` opens the certification-only catalog. Existing dashboard training remains available.

Quick Quiz (up to 5 questions), Diagnostic (up to 10), and Study Mode (up to 10) require no login. Signed-in learners use saved learning sessions. Guests use device-local seen/missed question history, domain performance, streaks, and practice XP. Guest practice does not award account XP, tokens, loot, or sweepstakes entries. Clearing browser storage removes guest learning history; it does not create account history when signing in later.

Feedback appears in a paid-asset dialog, with one Continue action. Mobile uses a bottom sheet; desktop uses a centered dialog. Closing feedback leaves the inline explanation available. Diagnostic/Study/Full modes preserve at least 1 HP so every selected question can be reviewed. Quick Quiz retains combat defeat rules. Full Test currently means up to 60 timed practice questions, using the existing per-question timer; it is not an official exam simulation or pass prediction. Banks smaller than 60 use all available questions.

## Full-test checkout

Full tests have a one-time unlock per published bank, with repeat attempts. Admins can test full banks free.

Deploy the migration and regenerate Prisma through the normal deployment script. Set `FULL_TEST_PRICE_USD` to the chosen amount (for example `2.99`); leave it empty to keep checkout disabled. Existing PayPal client/secret, `PAYPAL_ENV`, and public `APP_URL` / `NEXT_PUBLIC_APP_URL` settings apply. The public URL must match the site's real origin.

Subscribe the existing signed PayPal webhook endpoint to `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, and `PAYMENT.CAPTURE.REVERSED`, in addition to existing subscription events. `PAYPAL_WEBHOOK_ID` must match the configured webhook. A full refund/reversal revokes bank access; currently any refund event revokes access, including partial refunds.

The price and bank are saved server-side before approval. Payment verification checks the order, purchase reference, completed capture, amount, and currency. Capture retries are idempotent, and a bank/owner lock prevents duplicate capture across tabs. Signed webhook events can settle paid access if the browser does not return. Guest ownership uses an HTTP-only random cookie; account purchases can also be found by authenticated user ID. Guest purchases are available only in that browser; sign in before buying for cross-device access. There is no automatic guest-purchase merge into a later login.

No live payment was made during implementation. Before enabling a live fee, complete a PayPal sandbox approval/return, repeat capture, and refund test on the deployed origin with its database and webhook. Automated checks use mocked PayPal responses.
