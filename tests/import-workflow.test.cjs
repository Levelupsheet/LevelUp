const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const ts=require('typescript');
const React=require('react');const {create,act}=require('react-test-renderer');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,...args){if(request.startsWith('@/'))request=path.join(__dirname,'../src',request.slice(2));return resolve.call(this,request,parent,...args);};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const {importDestination}=require('../src/lib/importDestination.ts');
const bank=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/content/security-plus-sy0-701-test2-v2.json'),'utf8'));
const label=node=>node.children.filter(c=>typeof c==='string').join('');
async function fixture(sets=[]){const calls=[];let rows=[];
 const request=async(url,method='GET',body)=>{calls.push({url,method,body});
  if(url==='/api/admin/qsets')return method==='POST'?{set:{id:'new',...body,status:'DRAFT'}}:{sets};
  if(url==='/api/admin/placements')return method==='POST'?{ok:true}:{placements:[],certificationDestinations:['SECURITY_PLUS','AZ_900','AWS','AZURE','MD_102']};
  if(url==='/api/admin/careers')return {careers:[]};
  if(url.startsWith('/api/admin/questions?'))return {questions:rows,importIssues:[]};
  if(url==='/api/admin/questions'&&method==='POST'){rows=[{id:'q',prompt:'Imported question',type:'multiple_choice',difficulty:2,data:{reviewStatus:'PENDING'},review:{eligible:false,issues:[],warnings:[]}}];return {inserted:1,skippedDuplicates:0};}
  if(url==='/api/admin/questions'&&method==='PATCH'){rows=rows.map(q=>({...q,data:{reviewStatus:'APPROVED'},review:{...q.review,eligible:true}}));return {ok:true};}
  throw Error('Unexpected request: '+url);
 };
 const filename=path.join(__dirname,'../src/lib/contentRequest.ts');require.cache[filename]={id:filename,filename,loaded:true,exports:{contentRequest:request}};
 delete require.cache[require.resolve('../src/components/QuestionPipelineAdmin.tsx')];const Component=require('../src/components/QuestionPipelineAdmin.tsx').default;
 function Harness(){const[view,setView]=React.useState('import');return React.createElement(Component,{view,onViewChange:setView});}
 let renderer;await act(async()=>{renderer=create(React.createElement(Harness));});
 return {calls,renderer,get root(){return renderer.root;},button(text){return renderer.root.findAllByType('button').find(n=>label(n)===text);}};
}
global.window={confirm:()=>true};
test('metadata detects shipped certification banks and refuses mixed destinations',()=>{
 assert.equal(importDestination(bank).certExam,'SECURITY_PLUS');
 for(const [file,cert] of [['azure-az104-test2-v2.json','AZURE'],['aws-saa-c03-test1-v2.json','AWS'],['microsoft-md102-test1-v2.json','MD_102']])assert.equal(importDestination(JSON.parse(fs.readFileSync(path.join(__dirname,'../data/content',file),'utf8'))).certExam,cert);
 assert.equal(importDestination({blocks:[...bank.blocks,{...bank.blocks[0],certExam:'AWS'}]}),null);
 assert.equal(importDestination([{prompt:'Question'}]),null);
});
test('upload creates the named draft, imports directly, reviews and publishes to Security+',async()=>{
 const f=await fixture();
 const file=f.root.findAllByType('input').find(n=>n.props.type==='file');
 await act(async()=>{await file.props.onChange({target:{files:[{text:async()=>JSON.stringify(bank)}]}});});
 const cert=f.root.findAllByType('select').find(n=>n.props.value==='SECURITY_PLUS');assert.ok(cert);assert.equal(f.button('Import JSON to pool').props.disabled,false);
 await act(async()=>{await f.button('Import JSON to pool').props.onClick();});
 const create=f.calls.find(c=>c.url==='/api/admin/qsets'&&c.method==='POST');assert.equal(create.body.name,'Security+ SY0-701 Practice');assert.equal(create.body.domain,'SECURITY');
 assert.equal(f.calls.find(c=>c.url==='/api/admin/questions'&&c.method==='POST').body.setId,'new');
 await act(async()=>{await f.button('Approve reviewed valid questions').props.onClick();});
 await act(async()=>{f.button('Continue to publish').props.onClick();});
 assert.equal(f.button('Publish pool').props.disabled,false);
 await act(async()=>{await f.button('Publish pool').props.onClick();});
 const publish=f.calls.find(c=>c.url==='/api/admin/placements'&&c.method==='POST');assert.equal(publish.body.certExam,'SECURITY_PLUS');assert.equal(publish.body.lane,'CERTIFICATIONS');assert.equal(publish.body.setId,'new');
 assert.equal(f.calls.some(c=>/knowledge-blocks|generate-questions|publish-questions/.test(c.url)),false);
 await act(async()=>f.renderer.unmount());
});
test('explicit pool selection is preserved when uploading another bank; certifications available before publish',async()=>{
 const f=await fixture([{id:'existing',name:'Existing pool',status:'DRAFT',industry:'Healthcare'}]);
 const destination=f.root.findAllByType('select').find(n=>n.props.value==='TRAINING');
 await act(async()=>destination.props.onChange({target:{value:'CERTIFICATIONS'}}));
 assert.ok(f.root.findAllByType('option').some(n=>n.props.value==='AZ_900'));
 const pool=f.root.findAllByType('select').find(n=>n.children.some(c=>c.props?.value==='existing'));
 await act(async()=>pool.props.onChange({target:{value:'existing'}}));
 const file=f.root.findAllByType('input').find(n=>n.props.type==='file');await act(async()=>file.props.onChange({target:{files:[{text:async()=>JSON.stringify(bank)}]}}));
 await act(async()=>f.button('Import JSON to pool').props.onClick());
 assert.equal(f.calls.find(c=>c.url==='/api/admin/questions'&&c.method==='POST').body.setId,'existing');
 assert.equal(f.calls.some(c=>c.url==='/api/admin/qsets'&&c.method==='POST'),false);
 await act(async()=>f.renderer.unmount());
});
test('metadata reuses an existing named pool and pending questions cannot publish',async()=>{
 const f=await fixture([{id:'existing',name:bank.blocks[0].setName,status:'DRAFT'}]);
 await act(async()=>f.root.findByType('textarea').props.onChange({target:{value:JSON.stringify(bank)}}));
 await act(async()=>f.button('Use JSON destination').props.onClick());
 await act(async()=>f.button('Use JSON destination').props.onClick());
 assert.equal(f.button('Import JSON to pool').props.disabled,false);
 await act(async()=>f.button('Import JSON to pool').props.onClick());
 assert.equal(f.calls.some(c=>c.url==='/api/admin/qsets'&&c.method==='POST'),false);
 await act(async()=>f.button('Continue to publish').props.onClick());
 assert.equal(f.button('Publish pool').props.disabled,true);
 await act(async()=>f.renderer.unmount());
});
