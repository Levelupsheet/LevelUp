# Dynamic Boss AI Architecture

## Recommended production layout

```text
src/
├── engine/
│   ├── CombatQuizEngine.ts        # core combat rules + state contracts
│   ├── useCombatQuiz.ts           # HP / XP / damage application per question
│   └── systems/
│       ├── XPSystem.ts            # level + XP calculations
│       └── RewardSystem.ts        # raffle / chest / bonus rewards
├── lib/
│   ├── learningProfile.ts         # mastery, weakest domains, adaptive selection
│   ├── bossBattle.ts              # boss AI, stat scaling, ability assignment
│   ├── raffle.ts                  # capped entry issuing and audit trail
│   └── antiCheat.ts               # abuse controls, flags, cooldowns
├── app/api/
│   ├── content/active             # adaptive question selection for sessions
│   ├── game/session               # session completion + boss spawn
│   ├── game/boss-complete         # boss completion + rewards
│   └── admin/                     # content studio, sweeps, security review
└── components/
    ├── GameEngine.tsx             # flow controller + boss intro routing
    └── DiabloQuizRunner.tsx       # modal UI, animation, stats panels
```

## Boss AI flow

1. User finishes a regular session.
2. `/api/game/session` computes session accuracy + weakest domain.
3. `buildBossProfile()` scales boss HP, attack power, shield, and abilities.
4. `selectBossQuestions()` biases the pull toward the weakest domain.
5. `applyBossAbilitiesToQuestions()` injects question-level combat modifiers.
6. `DiabloQuizRunner` renders boss stats and applies combat animations.
7. `/api/game/boss-complete` stores outcome, reward data, and summary stats.

## Ability behavior implemented

- **Shield**: blocks the next correct answer's damage.
- **Heavy Strike**: increases player damage when that boss question is missed.
- **Double Attack**: doubles player damage on the assigned question.
- **Domain Lock**: biases boss question selection toward the user's weakest domain.

## Scaling inputs

Boss difficulty now scales from:
- user level snapshot
- regular-session accuracy
- selected boss-question difficulty
- golden boss variant modifier

## Persistence

`BossEncounter` now stores:
- `bossDomain`
- `difficultyScale`
- `playerLevelSnapshot`
- `sessionAccuracySnapshot`
- `playerStatsJson`
- `bossStatsJson`
- `abilitiesJson`
- `resultMetaJson`

This keeps one Postgres database as the source of truth while the backend owns gameplay logic.
