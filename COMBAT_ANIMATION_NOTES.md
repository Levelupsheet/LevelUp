# Combat Animation Update

Added lightweight modal-safe combat animation behavior to `src/components/DiabloQuizRunner.tsx`.

## Included
- idle player and enemy loop support
- attack state on correct answers
- damage state on wrong answers
- return-to-idle timing after each combat exchange
- floating damage numbers near each health panel
- responsive animation layout inside the quiz modal
- media preloading for smoother playback

## Media behavior
The runner now supports these optional video sources:
- `playerIdleSrc`
- `playerAttackSrc`
- `playerHitSrc`
- `enemyIdleSrc`
- `enemyAttackSrc`
- `enemyHitSrc`

If a dedicated hit/attack asset is not provided, the runner falls back to the idle asset and uses CSS animation overlays/shake effects.

## Current project assets wired already
- `/video/player-idle.mp4`
- `/video/player-attack.mp4`
- `/video/enemy-idle.mp4`

You can add these later for richer state changes:
- `/video/player-hit.mp4`
- `/video/enemy-attack.mp4`
- `/video/enemy-hit.mp4`
