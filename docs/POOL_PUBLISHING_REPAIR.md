Pool publishing repair
=====================

The reported screenshots show pool lists loading while pool details and learner catalogs fail. Server logs are required to confirm the production cause; a missing QuestionImportIssue table or placement columns can cause these failures when code is deployed without migrations. No production database was accessed during this repair.

Follow-up investigation found a definite migration omission: Prisma defines MCQQuestion.subdomain but the first 33 migrations never create it. This explains why full question queries can fail with P2022 even when migrate deploy reports no pending migrations, while pool count queries succeed. Migration 20261008160000_question_subdomain_schema_repair adds the nullable column using IF NOT EXISTS and preserves existing values. After pulling this repair, migrate deploy should discover 34 migrations and apply the new one. Server error metadata is still needed to rule out additional production drift.

After pulling main and installing dependencies, run `npm run deploy:build` with the production DATABASE_URL configured. This applies existing Prisma migrations, regenerates the client, and builds Next.js in that order. Restart the existing application service only after this command succeeds. Do not use migrate reset or delete production question data.

Verify a pool's stored questions load, review imported questions, approve valid content, and publish the selected destination. Confirm the destination appears in Position Training, Test Now or Certification Practice. If loading still fails, inspect the server log entries “Admin content load failed” and “Active pools load failed”.

The admin Advanced menu now raises its containing header above sibling cards. Pool requests preserve HTTP error context and no longer display zero stored questions when detail loading fails. Knowledge-block imports use the existing generator and enter the same pending-review workflow as direct question imports. Existing question records are preserved.

Publishing destinations now include a selector assembled from the career catalog, stored pools and existing placements, including the legacy Help Desk, Desktop Technician and Cloud Engineer mappings. Selecting a pool restores its existing placement target. Certification choices come from the server's Prisma enum and display readable labels such as Microsoft AZ-900 while submitting AZ_900. The API also accepts AZ-900 as an alias. Learner buttons continue to require active published placements with eligible content.

Validation: automated regression tests cover empty API responses, safe schema diagnostics, and knowledge-bank expansion. Production publishing still requires the server deployment and live smoke check above.
