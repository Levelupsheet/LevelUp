# Phase 3 Content Engine

Added a ready-to-drop content generation pipeline.

## Included
- `scripts/content/contentEngineCommon.mjs`
- `scripts/content/generateQuestions.mjs`
- `scripts/content/validateQuestions.mjs`
- `scripts/content/insertQuestions.mjs`
- `scripts/content/sampleKnowledgeBlocks.json`
- `scripts/content/generatedQuestions.json`
- `scripts/content/README.md`
- `package.json` script updates

## What it does
- converts knowledge blocks into typed LevelUp Pro questions
- supports:
  - `multiple_choice`
  - `fill_blank`
  - `sequence_order`
  - `multi_select`
  - `incident`
  - `cli_command`
- validates generated payloads before insert
- inserts question groups into Postgres through Prisma
- automatically creates/updates a `QuestionSet` and active `QuestionSetPlacement`
- replaces questions in the generated set on re-run so content refreshes cleanly

## Input design
Knowledge blocks can now include more than raw facts:
- facts
- definitions
- procedures
- commands
- scenarios
- distractors
- tags

This means you can paste in a lot of facts, but the best results come from grouping the knowledge by type.

## Important current limitation
Your Prisma enum for `QuestionDomain` currently only includes `NETWORKING`.
Other domains will be normalized to `NETWORKING` until you expand the enum in Prisma.
