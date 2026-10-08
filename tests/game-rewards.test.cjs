const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const {create, act} = require('react-test-renderer');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request,parent,...args) {
  if(request.startsWith('@/')) request=path.join(__dirname,'../src',request.slice(2));
  return resolve.call(this,request,parent,...args);
};
for (const ext of ['.ts','.tsx']) require.extensions[ext] = (module,filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
function mock(file,exports) { const filename=path.join(__dirname,'../src',file); require.cache[filename]={id:filename,filename,loaded:true,exports}; }
let runnerProps;
mock('components/DiabloQuizRunner.tsx',{__esModule:true,default:props=>{runnerProps=props;return null;}});
mock('lib/userStore.ts',{awardXp:()=>({id:'u',xp:100}),getActiveUser:()=>({id:'u',startingPosition:'HELPDESK_SUPPORT'})});
mock('lib/activityStore.ts',{addActivity(){}});
mock('lib/activeUser.ts',{hydrateAuthenticatedUser:async()=>{},resolveClientUserId:()=> 'u'});
const GameEngine=require('../src/components/GameEngine.tsx').default;
global.window={clearTimeout(){}};

test('quiz completion submits the required stable reward claim key and actual question difficulty',async()=>{
  const requests=[];
  global.fetch=async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({ok:true})};};
  const questions=[{id:'db-q',prompt:'Question',choices:['A','B'],correctIndex:0,level:5}];
  let renderer;
  await act(async()=>{renderer=create(React.createElement(GameEngine,{lane:'TRAINING',title:'Position Training',questionsOverride:questions}));});
  const summary={xpEarned:75,correctCount:1,totalQuestions:1,outcome:'victory',timeLeft:0};
  await act(async()=>{await runnerProps.onComplete(summary);await runnerProps.onComplete(summary);});
  const saves=requests.filter(r=>r.url==='/api/game/session');
  assert.equal(saves.length,2);
  assert.match(saves[0].body.rewardClaimKey,/^[a-f0-9-]{36}$/i);
  assert.equal(saves[0].body.rewardClaimKey,saves[1].body.rewardClaimKey);
  assert.equal(saves[0].body.questionDomains[0].level,5);
  await act(async()=>renderer.unmount());
});
