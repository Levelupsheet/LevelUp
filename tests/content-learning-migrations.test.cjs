const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {PGlite}=require('@electric-sql/pglite');
test('content and learning migrations preserve existing rows and apply repeatedly in PostgreSQL',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TYPE "GameSessionMode" AS ENUM ('TEST_NOW'); CREATE TABLE "QuestionSet" ("id" TEXT PRIMARY KEY,"name" TEXT); INSERT INTO "QuestionSet" VALUES ('pool','Existing pool'); CREATE TABLE "GameSession" ("id" TEXT PRIMARY KEY,"userId" TEXT,"createdAt" TIMESTAMP); INSERT INTO "GameSession" VALUES ('s','u',CURRENT_TIMESTAMP);CREATE TABLE "GameSessionQuestion" ("id" TEXT PRIMARY KEY,"questionId" TEXT,"answeredAt" TIMESTAMP); INSERT INTO "GameSessionQuestion" VALUES ('q','original',CURRENT_TIMESTAMP);`);
 for(const name of ['20261008040000_content_review','20261008050000_learning_sessions']){const sql=fs.readFileSync(path.join(__dirname,'../prisma/migrations',name,'migration.sql'),'utf8');await db.exec(sql);await db.exec(sql);}
 assert.equal((await db.query('SELECT * FROM "QuestionSet"')).rows[0].name,'Existing pool');assert.equal((await db.query('SELECT * FROM "GameSession"')).rows[0].trainingMode,'STANDARD');assert.equal((await db.query('SELECT * FROM "GameSessionQuestion"')).rows[0].questionId,'original');
 await db.exec(`INSERT INTO "QuestionImportIssue" ("id","setId","rowIndex","reason","payload") VALUES ('i','pool',1,'Unsupported format','{"original":"preserved"}')`);assert.equal((await db.query('SELECT "payload" FROM "QuestionImportIssue"')).rows[0].payload.original,'preserved');
 }finally{await db.close();}
});
