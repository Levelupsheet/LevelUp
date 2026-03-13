# Adaptive Learning Phase Update

Included in this build:
- Expanded `QuestionDomain` enum: `IDENTITY`, `NETWORKING`, `SECURITY`, `COMPUTE`, `STORAGE`, `AZURE`, `AWS`, `WINDOWS`, `GENERAL`
- Persistent learning profile tables:
  - `UserLearningProfile`
  - `UserDomainMastery`
  - `UserDifficultyAccuracy`
  - `UserQuestionHistory`
- Adaptive question selection in `/api/content/active`
- Session persistence in `/api/game/session`
- Dashboard mastery card using `/api/learning/profile`

## What the engine now tracks
- mastery per domain
- accuracy per difficulty and domain
- question history
- weakest domains

## Adaptive rules
- Correct answers increase mastery more at higher difficulty
- Wrong answers decrease mastery
- Target difficulty rises as mastery rises:
  - `< 40%` => tier 1
  - `40% - 69%` => tier 2
  - `70%+` => tier 3
- Recently answered questions are de-prioritized to reduce repetition
- Weak domains are prioritized during question selection

## Migration
Run on EC2:

```bash
npx prisma migrate deploy
npx prisma generate
```

## New API
- `GET /api/learning/profile`
- `GET /api/content/active` now returns adaptive sets when a user/session exists
- `POST /api/game/session` now stores answer history and updates mastery
