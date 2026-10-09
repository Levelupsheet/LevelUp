const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const vm=require('node:vm');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const flow=require('../src/lib/practiceFlow.ts'),history=require('../src/lib/guestPractice.ts');
function load(file,deps){const module={exports:{}};const source=ts.transpileModule(fs.readFileSync(require.resolve(file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(source,{module,exports:module.exports,require:n=>deps[n],console,URL,Request,Response,process,Date});return module.exports;}
const access=load('../src/lib/practiceAccess.ts',{'crypto':require('node:crypto'),'next/headers':{},'@/lib/auth/session':{},'@/lib/prisma':{},'@/lib/adminAuth':{}});
test('unseen questions precede recycled content, diagnostic samples domains and selection never duplicates IDs',()=>{
 const rows=[{id:'a',domainId:'network'},{id:'b',domainId:'network'},{id:'c',domainId:'security'},{id:'d',domainId:'cloud'}];
 const selected=flow.selectPracticeQuestions(rows,['a'],['a'],3,true,()=>.5);assert.deepEqual(selected.map(q=>q.id),['b','c','d']);
 assert.equal(new Set(flow.selectPracticeQuestions(rows,[],[],10).map(q=>q.id)).size,4);
 assert.deepEqual(flow.selectPracticeQuestions(rows,['a'],['c'],2,false,()=>.5).map(q=>q.id),['c','b']);
});
test('guest answers repair missed history and daily streaks do not increment twice or mint account rewards',()=>{
 let p=history.emptyGuestProgress();p=history.recordGuestAnswer(p,'q','network',false);assert.deepEqual(p.missed,['q']);p=history.recordGuestAnswer(p,'q','network',true);assert.deepEqual(p.missed,[]);assert.equal(p.domains.network.correct,1);assert.equal(p.domains.network.total,2);assert.deepEqual(p.seen,['q']);
 p=history.finishGuestPractice(p,20,new Date(2026,9,9));p=history.finishGuestPractice(p,5,new Date(2026,9,9));assert.equal(p.streak,1);p=history.finishGuestPractice(p,5,new Date(2026,9,10));assert.equal(p.streak,2);p=history.finishGuestPractice(p,5,new Date(2026,9,12));assert.equal(p.streak,1);assert.equal(p.xp,35);
});
test('fee configuration requires an explicit positive decimal, and captures must exactly match the saved purchase',()=>{
 for(const value of [undefined,'','0','-1','NaN','2.999','1000'])assert.equal(flow.practicePrice(value),null);assert.equal(flow.practicePrice('2.99'),299);
 const purchase={id:'p',orderId:'o',currency:'USD',amountCents:299};
 const order={id:'o',status:'COMPLETED',purchase_units:[{reference_id:'p',payments:{captures:[{id:'c',status:'COMPLETED',amount:{value:'2.99',currency_code:'USD'}}]}}]};
 assert.equal(access.verifiedPracticeCapture(order,purchase),true);
 for(const change of [o=>o.id='other',o=>o.status='APPROVED',o=>o.purchase_units[0].reference_id='other',o=>o.purchase_units[0].payments.captures[0].amount.value='0.01',o=>o.purchase_units[0].payments.captures[0].amount.currency_code='EUR',o=>o.purchase_units[0].payments.captures[0].status='PENDING']){const copy=structuredClone(order);change(copy);assert.equal(access.verifiedPracticeCapture(copy,purchase),false);}
 assert.equal(access.purchaseOwnerFilter({ownerHash:'cookie',userId:'account'}).OR.length,2);
});
test('public practice uses published banks, enforces full-test access, strips editorial metadata and derives missed/weak selections from history',async()=>{
 let unlocked=false;const bank={key:'CERTIFICATIONS:SECURITY_PLUS',lane:'CERTIFICATIONS',setIds:['pool']};
 const rows=[{id:'a',setId:'pool',prompt:'Question A',type:'multiple_choice',choices:['A','B'],correctIndex:0,difficulty:2,domainId:'network',data:{hints:['Hint'],sourceReferences:['private'],editorNotes:'private'}},{id:'b',setId:'pool',prompt:'Question B',type:'multiple_choice',choices:['A','B'],correctIndex:0,difficulty:3,domainId:'security',data:{}},{id:'bad',eligible:false,data:{}}];
 const route=load('../src/app/api/practice/session/route.ts',{'next/server':{NextResponse:{json:(d,o)=>Response.json(d,o)}},'@/lib/activePools':{getActiveContentPools:async()=>[bank]},'@/lib/prisma':{prisma:{mCQQuestion:{findMany:async({where})=>{assert.deepEqual(JSON.parse(JSON.stringify(where)),{setId:{in:['pool']}});return rows;}}}},'@/lib/contentPipeline':{learnerEligible:q=>q.eligible!==false},'@/lib/practiceFlow':flow,'@/lib/questionTransforms':{shuffleQuestionPayload:q=>q},'@/lib/practiceAccess':{hasPracticeAccess:async()=>unlocked}});
 const req=body=>new Request('https://example.test/api/practice/session',{method:'POST',body:JSON.stringify({bankKey:bank.key,...body})});
 let r=await route.POST(req({mode:'FULL'}));assert.equal(r.status,402);
 r=await route.POST(req({mode:'QUICK'}));let d=await r.json();assert.equal(d.questions.length,2);assert.equal(d.questions[0].data.editorNotes,undefined);assert.equal(d.questions[0].data.sourceReferences,undefined);assert.equal(r.headers.get('cache-control'),'no-store');
 r=await route.POST(req({mode:'STUDY',focus:'missed',missed:['b']}));d=await r.json();assert.equal(d.questions[0].id,'b');assert.equal(d.questions.length,1);
 r=await route.POST(req({mode:'STUDY',focus:'weak',domains:{network:{correct:1,total:2},security:{correct:0,total:2}}}));d=await r.json();assert.equal(d.questions[0].id,'b');
 r=await route.POST(req({mode:'QUICK',bankKey:'inactive'}));assert.equal(r.status,404);
 r=await route.POST(req({mode:'NOT_REAL'}));assert.equal(r.status,400);
 unlocked=true;r=await route.POST(req({mode:'FULL'}));assert.equal(r.status,200);
});
test('capture endpoint rejects foreign purchases and wrong amounts, and replay does not charge twice',async()=>{
 const savedEnv=process.env.FULL_TEST_PRICE_USD;process.env.FULL_TEST_PRICE_USD='2.99';
 const purchase={id:'p',orderId:'o',bankKey:'bank',ownerHash:'cookie',userId:null,amountCents:299,currency:'USD',status:'CREATED'};let owned=true,captureCount=0,amount='0.01',locks=0;
 const db={practicePurchase:{findFirst:async({where})=>where.orderId?(owned?purchase:null):purchase.status==='PAID'?purchase:null,findUnique:async()=>purchase,updateMany:async({data})=>Object.assign(purchase,data)},$queryRaw:async()=>{locks++;}};db.$transaction=async fn=>fn(db);
 const deps={'next/server':{NextResponse:{json:(d,o)=>Response.json(d,o)}},'@/lib/activePools':{getActiveContentPools:async()=>[{key:'bank',label:'Bank',lane:'TEST_NOW'}]},'@/lib/prisma':{prisma:db},'@/lib/practiceFlow':flow,'@/lib/practiceAccess':{practiceOwner:async()=>({ownerHash:'cookie',userId:null}),purchaseOwnerFilter:access.purchaseOwnerFilter,hasPracticeAccess:async()=>false,verifiedPracticeCapture:access.verifiedPracticeCapture},'@/lib/paypal':{getPayPalAccessToken:async()=>'mock-token',paypalBaseUrl:()=> 'https://paypal.test',appBaseUrl:()=> 'https://example.test'}};
 const source=fs.readFileSync(require.resolve('../src/app/api/practice/access/route.ts'),'utf8');const module={exports:{}};
 const mockFetch=async()=>{captureCount++;return{ok:true,json:async()=>({id:'o',status:'COMPLETED',purchase_units:[{reference_id:'p',payments:{captures:[{id:'capture',status:'COMPLETED',amount:{value:amount,currency_code:'USD'}}]}}]})};};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:n=>deps[n],fetch:mockFetch,process,console,URL,Date});
 const request=()=>new Request('https://example.test/api/practice/access',{method:'POST',headers:{origin:'https://example.test'},body:JSON.stringify({action:'capture',orderId:'o',amountCents:1,ownerHash:'forged'})});
 try{owned=false;assert.equal((await module.exports.POST(request())).status,404);assert.equal(captureCount,0);owned=true;assert.equal((await module.exports.POST(request())).status,409);assert.equal(purchase.status,'CREATED');amount='2.99';assert.equal((await module.exports.POST(request())).status,200);assert.equal(purchase.status,'PAID');const charged=captureCount;assert.equal((await module.exports.POST(request())).status,200);assert.equal(captureCount,charged);assert.ok(locks>=2);}finally{if(savedEnv===undefined)delete process.env.FULL_TEST_PRICE_USD;else process.env.FULL_TEST_PRICE_USD=savedEnv;}
});
test('purchase migration preserves durable ownership and rejects duplicate order/capture IDs and nonpositive prices',async()=>{
 const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();await db.exec(fs.readFileSync(require.resolve('../prisma/migrations/20261009210000_practice_purchases/migration.sql'),'utf8'));
 try {await db.exec(`INSERT INTO "PracticePurchase" (id,"bankKey","ownerHash","amountCents","orderId","captureId") VALUES ('p','bank','owner',299,'order','capture')`);for(const values of ["('q','bank','owner',0,'order2','capture2')","('q','bank','owner',299,'order','capture2')","('q','bank','owner',299,'order2','capture')"])await assert.rejects(()=>db.exec(`INSERT INTO "PracticePurchase" (id,"bankKey","ownerHash","amountCents","orderId","captureId") VALUES ${values}`));assert.equal((await db.query('SELECT * FROM "PracticePurchase"')).rows.length,1);}finally{await db.close();}
});
test('signed payment events grant access once, wrong-price events cannot grant, and refunds revoke without later revival',async()=>{
 const purchase={id:'p',orderId:'o',status:'CREATED',currency:'USD',amountCents:299};
 const db={practicePurchase:{findUnique:async()=>purchase,updateMany:async({where,data})=>{if((!where.status || where.status===purchase.status) && (!where.captureId || where.captureId===purchase.captureId))Object.assign(purchase,data);}}};
 const helper=load('../src/lib/practiceAccess.ts',{'crypto':require('node:crypto'),'next/headers':{},'@/lib/auth/session':{},'@/lib/prisma':{prisma:db},'@/lib/adminAuth':{}});
 const event={event_type:'PAYMENT.CAPTURE.COMPLETED',resource:{id:'capture',status:'COMPLETED',amount:{currency_code:'USD',value:'0.01'},supplementary_data:{related_ids:{order_id:'o'}}}};
 await helper.applyPracticeWebhook(event);assert.equal(purchase.status,'CREATED');event.resource.amount.value='2.99';await helper.applyPracticeWebhook(event);assert.equal(purchase.status,'PAID');await helper.applyPracticeWebhook({event_type:'PAYMENT.CAPTURE.REFUNDED',resource:{links:[{rel:'up',href:'https://api.paypal.com/v2/payments/captures/capture'}]}});assert.equal(purchase.status,'REVOKED');await helper.applyPracticeWebhook(event);assert.equal(purchase.status,'REVOKED');
});
