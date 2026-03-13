# Dynamic Boss AI Update

This package adds:

- `public/video/enemy-damage.mp4` for enemy and boss hit states
- weakest-domain boss targeting (`Domain Lock`)
- per-boss adaptive scaling based on user level + session accuracy
- special boss abilities injected into boss questions:
  - Shield
  - Heavy Strike
  - Double Attack
  - Domain Lock
- player and boss stat panels in the quiz modal
- persisted boss metadata in `BossEncounter`

## Notes

- Shield currently blocks the first assigned correct hit on the configured question.
- Heavy Strike and Double Attack increase player damage when the related boss question is missed.
- Boss stat values are persisted for auditing and post-battle review.
- Enemy damage animation now uses `/video/enemy-damage.mp4` when present.
