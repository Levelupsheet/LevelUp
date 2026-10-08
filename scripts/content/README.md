# LevelUp Pro content generator v2

Admin: Career → Pool → Questions → Preview generation & duplicates → Import → Review → Publish.

Use `data/content/azure365-v2.json` as the revised Azure/M365 source sample. It produces 41 supported questions across tiers 1–5 before comparison with an existing pool. Use `data/content/career-template-v2.json` for a career-neutral authoring example and `data/content/knowledge-bank-v2.schema.json` for editor validation. The uploaded original remains intact; its repeated/unsupported material is retained under referenceMaterial in the revised sample.

## Authoring

A v2 envelope has `schemaVersion: 2` and `blocks: []`. Each block has stable `id`, `setName`, explicit `lane`, and optional `domain`, `domainId`, `subdomain`. TRAINING blocks should specify `industry` and `careerPath` as arbitrary strings. `domain` is the existing database bucket (use GENERAL for another profession); `domainId` and `subdomain` are arbitrary learning dimensions. No career-specific application code is needed. `role` is also accepted as a careerPath alias for legacy sources.

Supported output: multiple_choice, true_false, cli_command. Unsupported requests and malformed source rows enter a report with their original payload. Facts use explicit answers and at least three plausible authored distractors. Definitions generate at most one recall assessment per concept. Scenarios/logs use authored options, an explicit answer and teaching explanation. Procedures require an authored next-step question; raw sequences remain reference material. True/false requires an authored claim and explicit truth value, rather than generating always-True claims. Commands require a precise task and command. Only explicitly verified acceptedCommands are graded as equivalents; legacy aliases are reported and not treated as interchangeable commands.

Difficulty is per item. Simple facts/definitions remain tiers 1–2; scenarios and authored assessments provide application, diagnosis and complex judgment. Tier 4–5 additionally requires evidence or constraints plus an authored explanation. Golden/Boss flags are opt-in and require tier 4–5. Repeating a fact with incident wording does not create a hard question.

Hints use authored cues when supplied, filtered against literal answer leakage; otherwise the generator provides a neutral reasoning cue. Gameplay uses these stored hints through its existing paid hint action. Authoring hints do not grant free hints or change hint costs. Automated screening cannot prove factual accuracy, semantic equivalence of commands, or the educational value of every distractor; human review remains required.

## One generator for Admin and CLI

```
node scripts/content/generateQuestions.mjs data/content/azure365-v2.json /tmp/azure-generated.json
node scripts/content/validateQuestions.mjs /tmp/azure-generated.json
```

Both use the production source modules via a development TypeScript loader. Output is a v2 envelope importable through Admin, with a preserved generation report. There is no separate legacy algorithm or random answer reshuffling. The old direct database insert script is retired because it deleted pool questions and bypassed review. Existing pool questions are never deleted by generation or import.

The generator uses stable objective/assessment identities and deterministic answer ordering. Exact prompt/answer duplicates, changed-distractor duplicates, repeated objective assessments and high-overlap same-answer prompts are reported before insertion. Distinct authored scenarios remain separate. Generation/import/publishing serialize relevant database writes; repeated calls do not create another copy of already-generated content. Existing archived duplicates are reported and may be restored through Admin rather than cloned. Preview is read-only; import repeats checks under a pool lock because the pool may change after preview.

## Source corrections

The original sample mixed Connect-MgGraph with Connect-AzAccount as aliases. The revised sample contains separate Graph and Az tasks, and separates Graph user queries from Az user queries. Microsoft Learn references:
- https://learn.microsoft.com/en-us/powershell/module/az.accounts/connect-azaccount
- https://learn.microsoft.com/en-us/powershell/module/microsoft.graph.authentication/connect-mggraph
- https://learn.microsoft.com/en-us/powershell/module/microsoft.graph.users/get-mguser

Repeated managed-device retrieval is retained once; the original compliance-state wording is preserved as reference rather than regenerated as another command task. Published regulatory or specialist content still requires source-owner review. The generator makes no claim that the uploaded content was comprehensively fact-checked.
