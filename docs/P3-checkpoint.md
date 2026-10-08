# P3 combat checkpoint

## Architecture found and corrected

The hook tracked a normalized 100-point enemy while the HUD rescaled that value to stage HP. The enemy rack copied player inventory, and scheduled abilities were unlimited. The engine now owns independent maximum/current HP, enemy tier, and a finite inventory carried between questions. Entering a new stage creates its configured enemy; another question at the same stage does not regenerate a defeated enemy. Five-tier defaults share GAME_CONFIG.

Player shields block incoming damage; fury doubles outgoing damage. Armed modifiers expire on the answered question even when unused. Enemy shields halve one outgoing hit, fury increases one wrong-answer hit by 50%, restore heals 10% on one wrong answer, and time pressure shortens one timer by 20%. Ticket Gremlin is forcibly powerless on tiers 1–3 even if a loadout attempts to override it. Higher-tier loadouts are separately configurable.

Inventory consumption uses a per-user transaction lock and durable ITEM_USE RewardClaim keyed by action. Retries return the original result without decrementing again, and duplicate inventory rows contribute to remaining counts. The client suppresses concurrent/repeated applications. Restore clamps to the player's actual maximum; boss extra-life can revive a lethal answer at 25% before final feedback is acknowledged. XP Surge now honestly describes and grants +50% XP on the current answer instead of its previous mismatched Time Slow behavior. Hints await coupon consumption and do not charge for impossible answer removal.

Desktop/mobile orb masks display actual engine HP. Existing rack/orb markup geometry, styling, and paid asset paths remain intact. Random correct-answer healing was removed.

## Verification and deployment

29 tests pass, including finite enemy loadouts, lower-tier Gremlin restrictions, separate HP maxima, stage transitions, modifier expiry, lethal timeouts, and the existing learning/reward regression suite. TypeScript and the full Next.js production build pass. No schema migration or production-data changes were needed.

## Follow-up boundaries

P4/P5 must derive reward eligibility from saved graded sessions rather than client reward totals, finish boss reservation/cooldown/settlement, defer Golden awards until surviving completion, and repair historical chest gaps. Live production DB and screenshot-based desktop/mobile verification are not available in this environment. Lost network responses can be retried with the same action key; leaving a question during an unresolved request intentionally never applies its effect to a later question.
