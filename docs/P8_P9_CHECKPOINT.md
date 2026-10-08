P8/P9 checkpoint
================

Baseline: b6622be, including the fixes from the user's other prompt. Work remained on main. No schema changes or data migrations are required by this checkpoint.

P8 source audit and changes
---------------------------

This is a source and automated-behavior audit of all 26 page routes, their shared shells, modals and asset references. It is not a claim of live desktop/mobile screenshot verification. Production login and database were not accessed.

| Surface / routes | Finding and action |
| --- | --- |
| / and /start | Shared existing marketing entry point; preserve purchased art and layout. |
| /dashboard | Preserve XP frame, career picker, loot access and combat entry fixes. Add dialog labels and keyboard focus management to leaderboard/player stats. Label reward-claim streak accurately; avoid presenting unavailable learning history as measured zeros. |
| /position-training, /test-now, /cert-mcq | Preserve GameEngine/HUD layout and dedicated training viewport. Existing question selection remains placement-driven. |
| PracticeMiniGameModal setup, combat and results | Add Tab containment, initial dialog focus, Escape through existing exit/abandon flow and focus restoration. Preserve paid assets and desktop/mobile geometry. |
| /training | Replace hard-coded IT promotional paths with published training destinations. Explicit loading failure and no-content states. |
| /certifications | Existing dynamic published certification catalog retained. |
| /practice | Existing paid hero and panel shell retained. |
| /interview/hr | Apply existing purchased hero/panel classes to older shell. |
| /interview/tech | Existing game shell retained. |
| /pvp | Remove visible literal backslash-n markup between sections. Preserve duel rules and art. |
| /rewards, /sweepstakes | Existing reward assets and navigation retained. |
| /profile/[userId] | Apply existing paid page/hero and asset button classes to older public profile shell. |
| /billing/paypal/success, /billing/paypal/cancel | Apply existing paid hero/buttons; wrap buttons on narrow screens. Payment logic unchanged. |
| /pro-development | Link to dedicated personal Insights. |
| /insights | New responsive personal Insights: one-column small-screen sections, two-column larger sections, 7/14-column activity grid, scrollable data tables, explicit loading/error/empty states and keyboard-visible controls. |
| /coach, /admin/insights | Legacy URLs redirect to /insights; remove the mixed personal/site-wide/AI Coach presentation. |
| /profile, /leaderboard | Existing dashboard redirects retained. |
| /admin, /admin/content, /admin/sweepstakes | Operational admin workflows retained; no cosmetic overhaul during this checkpoint. |

Current HUD image references and newly reused paid hero assets exist in public. CSS has an obsolete flow_blood_ball_001 reference in a historical selector, superseded by the existing blood-orb override; no HUD geometry or asset replacement was made. URLs with cache queries and encoded spaces were normalized when auditing paths.

P9 evidence and definitions
----------------------------

- /api/learning/insights requires a signed-in session. Client-supplied user IDs cannot override identity. Responses are private/no-store. Scope choices come from the owner's saved learning attempts and filter their sessions and evidence consistently.
- Saved answered GameSessionQuestion records are authoritative, including partial-session answers. Mastery uses the shared learning engine, repeated-question ceilings and hard-question evidence; it is not inferred from XP.
- Overall accuracy means fully correct answers divided by answered questions. Dimension percentages use the learning engine's average answer score, including any partial credit. Mastery remains a separate evidence-based measure.
- Readiness requires at least 20 answers, 10 distinct questions and 3 distinct correct tier 4–5 questions before labeling consistent practice performance. It explicitly does not predict passing an exam; coverage of unattempted syllabus content is not measured.
- Learning streaks count calendar dates with answered questions in the browser's IANA timezone. Today or yesterday can anchor the current streak. These differ from reward-claim streaks and do not grant rewards.
- Activity shows 14 calendar dates. Trend compares disjoint rolling 7-day windows; absent evidence appears as no answers, with no invented percentage-point change.
- Missed and recovered counts and recommendations use shared learning-engine reinforcement rules. Suggested formats are multiple choice, true/false and CLI. Career, pool, domain, difficulty and format summaries use actual saved attempts. Pool names resolve from stored pools; removed/legacy IDs display as historical pools.
- Recommendations launch via the dashboard's existing selection flow, preserving bank and career choice rather than silently choosing a training destination.

Validation and remaining work
------------------------------

Automated tests exercise empty history, local-date streaks, DST, expired streaks, repeated-answer ceilings, trends, missed-question recommendations, evidence thresholds, signed-out identity overrides, session ownership, invalid scope and timezone inputs, and private caching. Existing combat tests now reflect the latest main behavior: a defeated enemy is replaced for the next question while player damage persists. All 54 tests, TypeScript checking and the full Next.js production build passed.

Live visual acceptance remains: check 390px, 768px and 1440px layouts on the deployed site, keyboard focus/exit in practice and leaderboard dialogs, long explanations and result cards, and no HUD/XP-frame regressions. Source inspection cannot certify exact paid-art alignment on the live browser.

P10 follow-ups: roll up large learning histories to limit full-history query cost; apply modal focus handling to remaining secondary/admin modals; audit older auth helpers and public profile data exposure; protect all other admin analytics endpoints; audit the historical CSS cascade and improve remaining general error handling. P11 remains a separate content/new-user/deployment readiness checkpoint. No analytics-based exam-pass guarantee or automatic notification system was added.
