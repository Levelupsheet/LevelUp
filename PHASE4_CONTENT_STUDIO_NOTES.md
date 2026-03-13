# Phase 4 – Admin Content Studio

This upgrade completes the admin-side content pipeline for LevelUp Pro.

## Added
- `KnowledgeBlock` Prisma model
- `GeneratedQuestion` Prisma model
- `/admin/content` UI for importing blocks, generating questions, reviewing/editing them, and publishing approved questions
- API routes:
  - `GET/POST /api/admin/knowledge-blocks`
  - `POST /api/admin/generate-questions`
  - `GET/PATCH /api/admin/generated-questions`
  - `POST /api/admin/publish-questions`
- `src/lib/contentEngine.ts` shared generation/normalization helpers
- Prisma migration: `20260313040000_phase4_content_studio`

## Flow
1. Paste or upload JSON knowledge blocks in the admin content studio.
2. Save blocks to the `KnowledgeBlock` table.
3. Generate candidate questions into the `GeneratedQuestion` table.
4. Review/edit questions and mark them `APPROVED`, `EDITED`, or `REJECTED`.
5. Publish approved questions into the live `QuestionSet` / `MCQQuestion` tables.

## Important
Run Prisma migration before using the new content studio:

```bash
npx prisma migrate deploy
npx prisma generate
```

If you are developing locally:

```bash
npx prisma migrate dev -n phase4_content_studio
```

## Current scope
- Domains still normalize to `NETWORKING` because your current `QuestionDomain` enum only contains that value.
- Generation is deterministic/scripted, not LLM-powered yet.
- Publish currently replaces the existing generated set for that source block ID.
