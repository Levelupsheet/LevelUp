'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useContentPools } from '@/lib/useContentPools';
import type { ContentPool } from '@/lib/contentPools';
import { certificationLabel } from '@/lib/publishDestinations';
import { PRACTICE_MODES, type PracticeMode } from '@/lib/practiceFlow';
import { readGuestProgress, saveGuestProgress, recordGuestAnswer, finishGuestPractice, type GuestBankProgress } from '@/lib/guestPractice';
import DiabloQuizRunner, {type DiabloQuestion, type DiabloQuizRunSummary} from '@/components/DiabloQuizRunner';
import GameEngine from '@/components/GameEngine';
import PracticeDialog from '@/components/PracticeDialog';
import './practice-flow.css';
const bankLabel=(bank:ContentPool)=>bank.lane==='CERTIFICATIONS'?certificationLabel(bank.certExam || ''):bank.label;
export default function PracticeLauncher({lane}:{lane?:string}) {
  const {pools,loading,error}=useContentPools();
  const [bank,setBank]=useState<ContentPool|null>(null),[mode,setMode]=useState<PracticeMode|null>(null);
  const [questions,setQuestions]=useState<DiabloQuestion[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [summary,setSummary]=useState<DiabloQuizRunSummary|null>(null),[access,setAccess]=useState<any>(null),[checkout,setCheckout]=useState(false);
  const [auth,setAuth]=useState<{checked:boolean;signedIn:boolean}>({checked:false,signedIn:false});
  const [focus,setFocus]=useState<'missed'|'weak'|null>(null);
  const history=useRef<GuestBankProgress|null>(null),running=useRef(false),runKey=useRef(0),finished=useRef(false);
  const [localProgress,setLocalProgress]=useState<GuestBankProgress|null>(null);
  useEffect(()=>{let active=true;void fetch('/api/auth/me',{cache:'no-store'}).then(r=>r.json()).then(d=>{if(active)setAuth({checked:true,signedIn:!!d.user});}).catch(()=>{if(active)setAuth({checked:true,signedIn:false});});return()=>{active=false;};},[]);
  useEffect(()=>{
    const key=new URLSearchParams(window.location.search).get('bank');
    if (key && pools.length) setBank(pools.find(p=>p.key===key) || null);
  },[pools]);
  useEffect(()=>{
    if (!bank) return;
    let active=true;setAccess(null);setMessage('');history.current=readGuestProgress(bank.key);setLocalProgress(history.current);
    const params=new URLSearchParams(window.location.search);
    const capture=params.get('practiceCheckout')==='1' && params.get('token');
    void (async()=>{
      if(capture){
        setBusy(true);
        const response=await fetch('/api/practice/access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'capture',orderId:params.get('token')})});
        const data=await response.json();if(!response.ok)throw Error(data.error || 'Payment confirmation failed.');
        window.history.replaceState(null,'',`/learn?bank=${encodeURIComponent(data.bankKey)}`);
        if(active)setMessage('Payment confirmed. Full tests for this bank are unlocked.');
      }
      const response=await fetch(`/api/practice/access?bankKey=${encodeURIComponent(bank.key)}`,{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error);
      if(active)setAccess(data);
    })().catch(e=>{if(active)setMessage(e.message);}).finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;};
  },[bank?.key]);
  const recordAnswer=useCallback((question:DiabloQuestion,correct:boolean)=>{
    if(!bank || !question.id || !history.current)return;
    history.current=recordGuestAnswer(history.current,question.id,question.domainId || 'general',correct);
    if(!saveGuestProgress(bank.key,history.current))setMessage('Device storage is unavailable. Progress will last for this visit only.');
  },[bank?.key]);
  const complete=useCallback((result:DiabloQuizRunSummary)=>{
    if(finished.current)return;finished.current=true;
    if(bank && history.current){history.current=finishGuestPractice(history.current,result.xpEarned);saveGuestProgress(bank.key,history.current);setLocalProgress(history.current);}
    setSummary(result);
  },[bank?.key]);
  async function start(next:PracticeMode,nextFocus:'missed'|'weak'|null=null) {
    if(!bank || running.current || !auth.checked)return;
    if(next==='FULL' && !access?.unlocked){setCheckout(true);return;}
    running.current=true;setBusy(true);setMessage('');setSummary(null);finished.current=false;setFocus(nextFocus);
    try {
      if(auth.signedIn && next!=='FULL') {runKey.current++;setMode(next);return;}
      const progress=history.current || readGuestProgress(bank.key);
      const response=await fetch('/api/practice/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({bankKey:bank.key,mode:next,seen:progress.seen,missed:progress.missed,focus:nextFocus,domains:progress.domains})});
      const data=await response.json();if(!response.ok)throw Error(data.error);
      if(!data.questions?.length)throw Error('No questions available for this selection. Try another mode.');
      setQuestions(data.questions);runKey.current++;setMode(next);
      if(data.questions.length<data.requestedCount)setMessage(`This bank currently has ${data.questions.length} available questions; this run uses those questions.`);
    }catch(e:any){setMessage(e.message);}finally{running.current=false;setBusy(false);}
  }
  async function purchase() {
    if(!bank || running.current)return;running.current=true;setBusy(true);setMessage('');
    try {
      const response=await fetch('/api/practice/access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'create',bankKey:bank.key})});
      const data=await response.json();if(!response.ok)throw Error(data.error);
      if(data.unlocked){setAccess({...access,unlocked:true});setCheckout(false);}else window.location.assign(data.approveUrl);
    }catch(e:any){setMessage(e.message);}finally{running.current=false;setBusy(false);}
  }
  const exit=()=>{setMode(null);setSummary(null);setQuestions([]);};
  if(mode && bank && !summary)return <main className="publicPracticeRun paidAssetPage">
    {auth.signedIn && mode!=='FULL'?<GameEngine metaLeft="Signed in • Account progress saved" key={runKey.current} lane={bank.lane as any} title={bankLabel(bank)} timed={PRACTICE_MODES[mode].timed} questionCount={PRACTICE_MODES[mode].count} industry={bank.industry} careerPath={bank.careerPath} certExam={bank.certExam} bankDomain={bank.domain} completeAllQuestions={mode!=='QUICK'} trainingMode={focus==='missed'?'MISSED_QUESTIONS':focus==='weak'?'WEAK_DOMAIN':'STANDARD'} feedbackSheet onExit={exit} onComplete={complete}/>:
    <DiabloQuizRunner metaLeft="Device practice • Local progress" metaRight={message || `${questions.length} questions`} key={runKey.current} title={bankLabel(bank)} subtitle={PRACTICE_MODES[mode].label} questions={questions} timed={PRACTICE_MODES[mode].timed} completeAllQuestions={mode!=='QUICK'} guestPractice feedbackSheet onAnswerReviewed={recordAnswer} onComplete={complete} onExit={exit} media={{playerIdleSrc:'/video/helpdesk-wizard-idle.mp4',playerAttackSrc:'/video/player-attack.mp4',playerHitSrc:'/video/helpdesk-wizard-hit.mp4',enemyIdleSrc:'/video/enemy-idle.mp4',enemyHitSrc:'/video/enemy-damage.mp4',width:1600,height:900}}/>}
  </main>;
  const groups=[...new Set(pools.filter(p=>!lane || p.lane===lane).filter(p=>['TRAINING','CERTIFICATIONS','TEST_NOW'].includes(p.lane)).map(p=>p.lane==='TRAINING'?p.industry || 'Careers':p.lane==='CERTIFICATIONS'?'Certifications':'Test Now'))];
  return <main className="page paidAssetPage certificationsAssetPage"><div className="container learningCatalogInner">
    <section className="card paidAssetHero"><div className="dashboardEyebrow">PRACTICE • LEARN • LEVEL UP</div><h1>Choose your next challenge.</h1><p>Pick a career or certification, choose your mode, and start. Quick quizzes, diagnostics, and study sessions are free.</p><div className="practiceHeroLinks"><span>No login required.</span><a href="/dashboard">Sign in / My dashboard</a><a href="/learn">All practice banks</a></div></section>
    {loading?<p role="status">Loading published question banks…</p>:error?<p role="alert">{error}</p>:!groups.length?<p>No published practice banks yet. Please check back soon.</p>:null}
    <div className="practiceCatalogGroups">{groups.map(group=><section key={group}><h2>{group}</h2><div className="learningTrackGrid">{pools.filter(p=>(!lane || p.lane===lane) && (p.lane==='TRAINING'?p.industry || 'Careers':p.lane==='CERTIFICATIONS'?'Certifications':'Test Now')===group).map(pool=><article key={pool.key} className="card paidAssetPanel practiceBankCard"><h3>{bankLabel(pool)}</h3><p>{pool.questionCount} published questions</p><div className="practiceBankActions"><button className="gdActionOrange" onClick={()=>{setBank(pool);exit();setCheckout(false);}}>Start →</button><span>{pool.lane==='TRAINING'?'Career practice':'Exam practice'}</span></div></article>)}</div></section>)}</div>
    {bank && !mode && !checkout && <PracticeDialog title={bankLabel(bank)} onClose={()=>setBank(null)}><p>Choose your mode. {localProgress?.sessions || 0} practice sessions completed on this device.</p>{!auth.signedIn && <p className="practiceNotice">Guest progress and practice XP stay on this device. Sign in for synced learning progress and account rewards.</p>}<div className="practiceModes">{Object.entries(PRACTICE_MODES).map(([key,value])=><button key={key} className="practiceMode" disabled={busy || !auth.checked} onClick={()=>void start(key as PracticeMode)}><strong>{value.label} • {key==='FULL'?(access?.unlocked?'Unlocked':access?.amountCents?`$${(access.amountCents/100).toFixed(2)} bank unlock`:'Paid unlock'): 'Free'}</strong><span>{value.description}</span><span>Up to {Math.min(value.count,bank.questionCount)} questions</span></button>)}</div>{message && <p className="practiceError" role="status">{message}</p>}</PracticeDialog>}
    {bank && checkout && <PracticeDialog title="Unlock full tests" onClose={()=>setCheckout(false)}><h3>{bankLabel(bank)}</h3><p>One payment unlocks repeat full tests for this bank. Quick Quiz, Diagnostic, and Study Mode remain free.</p><p>Without an account, the unlock stays with this browser. Sign in before buying to access your purchase from other devices.</p>{access?.amountCents && <p><b>${(access.amountCents/100).toFixed(2)} USD • one-time payment</b></p>}<button className="gdActionOrange practiceContinue" disabled={busy || !access?.checkoutEnabled} onClick={()=>void purchase()}>{busy?'Confirming…':'Continue to PayPal'}</button>{!access?.checkoutEnabled && <p>Full-test checkout is not configured yet. You can start free practice now.</p>}<button className="d2Btn practiceContinue" onClick={()=>setCheckout(false)}>Back to free practice</button>{message && <p role="alert" className="practiceError">{message}</p>}</PracticeDialog>}
    {summary && bank && <PracticeDialog title={summary.outcome==='victory'?'Victory':'Practice complete'} onClose={exit}><p>{summary.correctCount}/{summary.totalQuestions} correct • {Math.round(summary.correctCount/Math.max(1,summary.totalQuestions)*100)}% accuracy</p><h3>{mode==='DIAGNOSTIC'?'Your next study steps':'Topics to reinforce'}</h3>{Object.entries(summary.masteryByDomain || {}).sort((a,b)=>a[1]-b[1]).map(([domain,value])=><p key={domain}>{domain.replaceAll('_',' ')}: {Math.round(value)}% session mastery</p>)}<p className="practiceNotice">This is practice feedback, not an official exam pass prediction.</p><div className="practiceResultActions"><button className="d2Btn" disabled={busy} onClick={()=>void start('STUDY','missed')}>Practice missed questions</button><button className="d2Btn" disabled={busy} onClick={()=>void start('STUDY','weak')}>Work on weak areas</button><button className="gdActionOrange" disabled={busy} onClick={()=>void start(mode || 'QUICK')}>Try again</button><button className="d2Btn" onClick={exit}>Choose another mode</button></div>{message && <p role="alert">{message}</p>}</PracticeDialog>}
  </div></main>;
}
