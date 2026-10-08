const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
test('PostgreSQL migration canonicalizes all three IT paths, preserves data and is repeatable', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TYPE "ContentLane" AS ENUM ('TRAINING','TEST_NOW','CERTIFICATIONS','INTERVIEW');
      CREATE TYPE "StartingPosition" AS ENUM ('HELPDESK_SUPPORT','DESKTOP_TECHNICIAN','CLOUD_ENGINEER');
      CREATE TYPE "CertExam" AS ENUM ('A_PLUS','AZURE');
      CREATE TABLE "QuestionSet" ("id" TEXT PRIMARY KEY, "status" TEXT);
      CREATE TABLE "MCQQuestion" ("id" TEXT PRIMARY KEY, "setId" TEXT, "prompt" TEXT);
      CREATE TABLE "QuestionSetPlacement" (
        "id" TEXT PRIMARY KEY, "setId" TEXT, "lane" "ContentLane", "startingPosition" "StartingPosition",
        "industry" TEXT, "careerPath" TEXT, "certExam" "CertExam", "isActive" BOOLEAN,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO "QuestionSet" VALUES ('help','PUBLISHED'),('desktop','PUBLISHED'),('cloud','PUBLISHED'),('draft','DRAFT');
      INSERT INTO "MCQQuestion" VALUES ('q1','help','Preserve this question'),('q2','draft','Preserve unpublished content');
      INSERT INTO "QuestionSetPlacement" ("id","setId","lane","startingPosition","industry","careerPath","isActive") VALUES
        ('legacy-help','help','TRAINING','HELPDESK_SUPPORT',NULL,NULL,TRUE),
        ('dynamic-help','help','TRAINING',NULL,'Information Technology','Help Desk',TRUE),
        ('legacy-desktop','desktop','TRAINING','DESKTOP_TECHNICIAN',NULL,NULL,TRUE),
        ('legacy-cloud','cloud','TRAINING','CLOUD_ENGINEER',NULL,NULL,TRUE),
        ('inactive-help','help','TRAINING','HELPDESK_SUPPORT',NULL,NULL,FALSE),
        ('draft-active','draft','TEST_NOW',NULL,NULL,NULL,TRUE);
    `);
    const sql = fs.readFileSync(path.join(__dirname,'../prisma/migrations/20261008023000_canonical_live_placements/migration.sql'),'utf8');
    await db.exec(sql);
    await db.exec(sql);
    const { rows } = await db.query('SELECT * FROM "QuestionSetPlacement" ORDER BY "id"');
    assert.equal(rows.length,6);
    assert.equal(rows.filter(p=>p.setId==='help'&&p.isActive).length,1);
    assert.deepEqual(rows.filter(p=>p.lane==='TRAINING'&&p.isActive).map(p=>p.careerPath).sort(),['Cloud Engineer','Desktop Technician','Help Desk']);
    assert.ok(rows.filter(p=>p.lane==='TRAINING').every(p=>p.industry==='Information Technology'&&p.startingPosition===null));
    assert.equal(rows.find(p=>p.id==='inactive-help').isActive,false);
    assert.equal((await db.query('SELECT * FROM "MCQQuestion"')).rows.length,2);
    assert.equal((await db.query('SELECT * FROM "QuestionSet"')).rows.length,4);
    await assert.rejects(db.exec(`INSERT INTO "QuestionSetPlacement" ("id","setId","lane","industry","careerPath","isActive") VALUES ('duplicate','help','TRAINING','Information Technology','Help Desk',TRUE)`),/duplicate key/);
  } finally { await db.close(); }
});
