# LevelUp Pro Quiz Engine Audit

## What I found

### Current strengths
- The combat engine already had a solid shared state model for HP, mastery, and XP.
- A reusable quiz runner UI already existed (`DiabloQuizRunner`).
- `TEST_NOW` already pulled from the active content API and the DB-backed question-set system exists in Prisma.

### Main issues found
1. **Question order was deterministic from the DB**
   - `/api/content/active` returned questions in `sortOrder` only.
   - This made repeated runs feel predictable.

2. **Choice order was not randomized server-side**
   - `correctIndex` could only remain valid if the choices stayed fixed.
   - Repeated exposure makes memorization easier than learning.

3. **Timer logic was split across two patterns**
   - `useCombatQuiz` already supports per-question timers.
   - `test-now/page.tsx` still used a separate whole-test countdown.

4. **Quiz layout was duplicated**
   - `PracticeMiniGameModal` duplicated large parts of the main combat runner UI.
   - This increases maintenance cost and drift risk.

5. **Question-set reset logic was too shallow**
   - The engine reset only when question length changed.
   - A new randomized set with the same number of questions could reuse stale state.

6. **Auth tie-in is still incomplete in the repo**
   - I did not find a real Google auth/session implementation in the uploaded code.
   - The app still relies heavily on local user state and demo fallbacks.

## Changes made
- Added server-side question sampling and answer-choice shuffling.
- Preserved `correctIndex` after choice shuffles.
- Normalized DB difficulty into combat levels.
- Switched `Test Now` to the shared combat engine's **per-question timer**.
- Refactored `PracticeMiniGameModal` to use the shared `DiabloQuizRunner` layout.
- Hardened quiz-engine resets so a new randomized set restarts cleanly.
- Added a lightweight client user resolver for pages that still rely on local auth state.

## Recommended next step for Google auth
Implement a proper auth/session layer and make quiz/test routes resolve the user from the server session instead of trusting client-provided `userId`. The uploaded repo does not yet contain that auth layer, so I left the code ready for that integration but did not invent an auth stack that was not present in the project.
