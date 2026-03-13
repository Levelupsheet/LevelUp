# LevelUp Pro Content Engine (Phase 3)

This pipeline turns knowledge blocks into typed questions for the LevelUp Pro game engine.

## Flow

```text
knowledge blocks
  -> generator
  -> validation
  -> normalized JSON
  -> Prisma/Postgres insert
```

## Why structured knowledge blocks work best

You do **not** need to put every block into one giant `facts` array.
The generator is designed to work better when the input is split into the kinds of knowledge you already have:

- `facts` for direct truth statements
- `definitions` for term -> meaning
- `procedures` for ordered steps
- `commands` for CLI tasks
- `scenarios` for incident-style prompts
- `distractors` for better multiple-choice wrong answers

You can still add lots of facts to a single block. The more context you provide, the more varied the generated questions can be.

## Input shape

See `sampleKnowledgeBlocks.json`.

Each block can include:

- `setName`
- `domain`
- `lane`
- `startingPosition`
- `certExam`
- `difficulty`
- `stage`
- `facts`
- `definitions`
- `procedures`
- `commands`
- `scenarios`
- `distractors`
- `tags`

## Output shape

The generator outputs a grouped payload in `generatedQuestions.json`:

- set metadata
- placement metadata
- LevelUp Pro typed questions

Each question matches the app's DB/admin payload shape:

- `prompt`
- `type`
- `difficulty`
- `explanation`
- `tags`
- `data`
- `choices` / `correctIndex` for compatibility where relevant

## Commands

Generate questions:

```bash
npm run content:generate
```

Validate generated JSON:

```bash
npm run content:validate
```

Insert into Postgres through Prisma:

```bash
npm run content:insert
```

One-shot pipeline:

```bash
npm run content:build
```

Custom files:

```bash
node scripts/content/generateQuestions.mjs ./my-blocks.json ./my-generated.json
node scripts/content/validateQuestions.mjs ./my-generated.json
node scripts/content/insertQuestions.mjs ./my-generated.json
```

## Important note about domains

Your current Prisma enum only contains `NETWORKING` under `QuestionDomain`.
That means insertions for other domains will be normalized to `NETWORKING` until you expand the enum in Prisma.
The question tags and text still preserve the original source topic.
