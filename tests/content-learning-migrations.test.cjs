const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {PGlite}=require('@electric-sql/pglite');
test('question schema repair creates the missing subdomain column and preserves rows and existing values',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE "MCQQuestion" ("id" TEXT PRIMARY KEY,"prompt" TEXT,"data" JSONB); INSERT INTO "MCQQuestion" VALUES ('q','Existing question','{"reviewStatus":"APPROVED"}');`);
 const sql=fs.readFileSync(path.join(__dirname,'../prisma/migrations/20261008160000_question_subdomain_schema_repair/migration.sql'),'utf8');
 await db.exec(sql);
 const row=(await db.query('SELECT * FROM "MCQQuestion"')).rows[0];
 assert.equal(row.prompt,'Existing question');assert.equal(row.data.reviewStatus,'APPROVED');assert.equal(row.subdomain,null);
 await db.exec(`UPDATE "MCQQuestion" SET "subdomain"='Identity' WHERE "id"='q'`);
 await db.exec(sql);assert.equal((await db.query('SELECT "subdomain" FROM "MCQQuestion"')).rows[0].subdomain,'Identity');
 }finally{await db.close();}
});
test('content and learning migrations preserve existing rows and apply repeatedly in PostgreSQL',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TYPE "GameSessionMode" AS ENUM ('TEST_NOW'); CREATE TABLE "QuestionSet" ("id" TEXT PRIMARY KEY,"name" TEXT); INSERT INTO "QuestionSet" VALUES ('pool','Existing pool'); CREATE TABLE "GameSession" ("id" TEXT PRIMARY KEY,"userId" TEXT,"createdAt" TIMESTAMP); INSERT INTO "GameSession" VALUES ('s','u',CURRENT_TIMESTAMP);CREATE TABLE "GameSessionQuestion" ("id" TEXT PRIMARY KEY,"questionId" TEXT,"answeredAt" TIMESTAMP); INSERT INTO "GameSessionQuestion" VALUES ('q','original',CURRENT_TIMESTAMP);`);
 for(const name of ['20261008040000_content_review','20261008050000_learning_sessions']){const sql=fs.readFileSync(path.join(__dirname,'../prisma/migrations',name,'migration.sql'),'utf8');await db.exec(sql);await db.exec(sql);}
 assert.equal((await db.query('SELECT * FROM "QuestionSet"')).rows[0].name,'Existing pool');assert.equal((await db.query('SELECT * FROM "GameSession"')).rows[0].trainingMode,'STANDARD');assert.equal((await db.query('SELECT * FROM "GameSessionQuestion"')).rows[0].questionId,'original');
 await db.exec(`INSERT INTO "QuestionImportIssue" ("id","setId","rowIndex","reason","payload") VALUES ('i','pool',1,'Unsupported format','{"original":"preserved"}')`);assert.equal((await db.query('SELECT "payload" FROM "QuestionImportIssue"')).rows[0].payload.original,'preserved');
 }finally{await db.close();}
});
test('career preference migration is additive, repeatable, and preserves existing catalogs and XP',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE "User" ("id" TEXT PRIMARY KEY,"xp" INTEGER); INSERT INTO "User" VALUES ('u',9999);
 CREATE TABLE "CareerCatalog" ("id" TEXT PRIMARY KEY,"industry" TEXT,"careerPath" TEXT,"isActive" BOOLEAN,"sortOrder" INTEGER,"createdAt" TIMESTAMP,"updatedAt" TIMESTAMP, UNIQUE("industry","careerPath"));
 INSERT INTO "CareerCatalog" VALUES ('custom','Aerospace','Flight Systems Technician',FALSE,42,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);`);
 const sql=fs.readFileSync(path.join(__dirname,'../prisma/migrations/20261008060000_career_preferences/migration.sql'),'utf8');await db.exec(sql);await db.exec(sql);
 const user=(await db.query('SELECT * FROM "User"')).rows[0];assert.equal(user.xp,9999);assert.equal(user.selectedIndustry,null);assert.equal(user.selectedCareerPath,null);
 assert.equal((await db.query(`SELECT "isActive" FROM "CareerCatalog" WHERE "id"='custom'`)).rows[0].isActive,false);
 const industries=(await db.query('SELECT DISTINCT "industry" FROM "CareerCatalog"')).rows.map(row=>row.industry);
 for(const name of ['Information Technology','Healthcare','Sales','Software Development','Real Estate','Transportation','Industrial/Skilled Trades'])assert.ok(industries.includes(name));
 }finally{await db.close();}
});
