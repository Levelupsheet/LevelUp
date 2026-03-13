# LevelUp Pro v2 Engine Upgrade

This build adds a first-pass v2 engine architecture while keeping your current UI usable.

## Added
- `src/engine/constants/gameConfig.ts`
- `src/engine/systems/*`
- `src/engine/hooks/*`
- `src/components/GameEngine.tsx`
- `/api/game/session` to persist XP earned by a game run to PostgreSQL
- Expanded quiz runner layout to support player/enemy MP4 panels
- Google login button surfaced in the dashboard navbar

## Notes
- Questions are loaded from the database whenever an active set exists.
- Old local pools are only a fallback if no DB set is assigned.
- Idle + player attack MP4 states are wired. You can add more state videos in `/public/video` and pass them through the `media` prop later.
- This build saves XP to the user record but does not yet store per-question telemetry in a dedicated table.
