# P1 question content checkpoint

Authoring uses Career → Pool → Questions → Review → Publish in the Admin Questions area. Draft pools store free-text industry/career metadata; training destinations remain database placements. Existing pool records and question IDs are retained.

The shared contentPipeline module validates explicit answers, the three supported formats, integer difficulty tiers 1–5, explanations, and hard-tier Golden/Boss eligibility. Imports enter PENDING review. Invalid or duplicate import rows are reported individually and preserved verbatim in QuestionImportIssue for repair. Exact duplicate detection includes the correct answer and ignores choice order. Similar prompts are no longer removed by reordering or learner loading. Questions can be edited including answers/data, approved, rejected, archived and restored. Clear pool archives questions and unpublishes placements transactionally. Individual removal archives rather than deleting.

Publishing and learner loading use shared eligibility. Pending/rejected/archived/unsupported/malformed rows remain stored but are excluded. Existing structurally valid legacy rows without review metadata remain available. Pool catalogs count eligible questions and suppress empty destinations. Generated fact-bank sync stages draft content for review rather than automatically publishing, and retains previous generated content. The older explicit reviewed-generation publish action rejects unsupported content and archives replaced questions.

Difficulty rubric: 1 recall, 2 understanding, 3 application, 4 diagnosis, 5 complex judgment. Human review determines pedagogical suitability; software validates tier range and hard-tier reward constraints.

Migration 20261008040000_content_review adds optional QuestionSet industry/careerPath and the import issue table, with no destructive data migration. It is not applied to production here because no production database connection is configured. Deploy with prisma migrate deploy before using the new Admin workflow.

Validation: content pipeline tests, prior combat/reward/migration tests, TypeScript and full Next.js production build. No combat HUD or dashboard styling changes.

Limitations: certification identifiers and broad legacy domain enums remain existing schema constraints; arbitrary career content can use GENERAL plus data.domainId/subdomain. The JSON importer accepts arrays, individual objects and {questions:[...]}; choose the destination pool explicitly. Near-duplicate and pedagogical quality review remain human decisions. Production content coverage must be reviewed after deployment.
