# AI tech interview simulator

Dashboard **Start Tech Interview** opens the conversational simulator; `/interview/tech` is the standalone version. It uses the existing paid dark-fantasy dialog asset. HR buttons lead to the existing `/interview/hr` experience; its engine is unchanged. Combat HUD geometry remains unchanged.

Set server-only `OPENAI_API_KEY` and optionally `INTERVIEW_AI_MODEL` (default `gpt-4o-mini`), then rebuild/restart the app. Do not prefix the key with `NEXT_PUBLIC_`. The server calls the OpenAI Responses API with strict structured output and `store: false`. This setting does not promise zero provider retention. There is no rule-based fallback pretending to be AI. Missing credentials and provider failures show an explicit error.

A signed-in learner chooses a role, industry and experience level. The saved career pre-fills the form; additional roles do not need a question-bank code change. The interviewer asks six open-ended questions, probes the actual answers and supplies per-answer coaching and examples. The report averages technical accuracy, reasoning, communication and safe practice (0–5 each). The existing 68% tech practice benchmark remains a practice benchmark, not a hiring prediction or professional certification.

Session and transcript data remain in existing InterviewSession/InterviewTurn records; versioned JSON state uses InterviewSession.summary. No schema migration, question deletion or production data rewrite is required. Latest reports can be reopened and unfinished conversations resume. Only role, industry, level and transcript go to the AI provider; learners should not submit credentials or confidential information.

Routes derive ownership from the signed auth cookie, not client user IDs. Per-session database locks serialize answers; request UUID replay does not repeat an AI call or append turns. Stale question submissions fail. Provider failure preserves the question and browser answer. Completion is transactional and repeat-safe. AI practice does not generate fake job offers, verification badges or sweepstakes rewards. Existing historical sessions are preserved.

Validation uses mocked provider responses (no paid live request), ownership/replay tests and the full project build. Deployment smoke test: configure the key, start from dashboard, answer six questions, close/reopen mid-session, retry a failed request and reopen the final coaching report. Verify the configured provider/model on the deployed server before release. Provider billing and quotas apply.
