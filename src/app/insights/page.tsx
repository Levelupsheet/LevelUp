'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
function scopeLabel(scope: string) { try { return JSON.parse(scope).filter(Boolean).join(' · ').replaceAll('_', ' '); } catch { return scope; } }
export default function InsightsPage() {
 const [data,setData]=useState<any>(null), [scope,setScope]=useState(''), [error,setError]=useState(''), [loading,setLoading]=useState(true), [retry,setRetry]=useState(0);
 useEffect(()=>{
  const controller=new AbortController(); setLoading(true); setError('');
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  fetch('/api/learning/insights?'+new URLSearchParams({timezone,scope}),{cache:'no-store',signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error || 'Could not load insights');return d;}).then(setData).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return ()=>controller.abort();
 },[scope,retry]);
 const summary=data?.summary;
 return <main className="page paidAssetPage insightsGamePage learningInsightsPage"><div className="container">
  <header className="card paidAssetHero"><h1>Insights</h1><p>Your answers, mastery and next learning steps.</p><Link className="secondaryBtn gdActionBlue" href="/dashboard">Dashboard</Link></header>
  {error && <div className="card" role="alert"><p>{error}</p><button onClick={()=>setRetry(n=>n+1)}>Retry</button></div>}
  <label className="insightsScope">Learning scope <select value={scope} onChange={e=>setScope(e.target.value)}><option value="">All learning</option>{(data?.scopes || []).map((s:string)=><option key={s} value={s}>{scopeLabel(s)}</option>)}</select></label>
  {loading ? <p role="status">Loading your learning history…</p> : !error && data && <>
   {!summary.attempts && <section className="card"><h2>Build your learning baseline</h2><p>Complete a free training session to see accuracy, mastery and recommendations here.</p><Link className="secondaryBtn gdActionOrange" href="/dashboard">Choose training</Link></section>}
   <section className="insightsMetrics" aria-label="Learning summary">{[['Answered',summary.attempts],['Accuracy',summary.accuracy===null?'No answers':summary.accuracy+'%'],['Mastery',summary.attempts?summary.mastery+'%':'No evidence'],['Completed sessions',summary.completedSessions],['Questions to reinforce',summary.missedQuestions],['Recovered questions',summary.recoveredQuestions]].map(([label,value])=><div className="card" key={label}><small>{label}</small><strong>{value}</strong></div>)}</section>
   <div className="insightsColumns"><section className="card"><h2>Practice readiness</h2><strong>{data.readiness.label}</strong><p>{data.readiness.explanation}</p><p>{summary.distinctQuestions} distinct questions · {data.readiness.correctHardQuestions} correct hard questions</p></section>
   <section className="card"><h2>Your next session</h2><ul>{data.recommendations.map((r:string)=><li key={r}>{r}</li>)}</ul><p>Choose Missed Questions or Weak Domains in the training setup when recommended.</p><Link className="secondaryBtn gdActionOrange" href="/dashboard">Start learning</Link></section></div>
   <section className="card"><h2>Learning activity</h2><p>{data.activity.currentStreak} day current streak · {data.activity.bestStreak} day best streak · {data.activity.activeDays} active days</p><p>{data.activity.practicedToday?'You practiced today.':'Answer a question today to continue your learning habit.'} Activity uses {data.activity.timezone}.</p><div className="insightsActivity">{data.activity.days.map((d:any)=><div key={d.date} className={d.attempts?'active':''} title={`${d.date}: ${d.attempts} answers`}><small>{d.date.slice(5)}</small><b>{d.attempts}</b><span className="srOnly"> answers</span></div>)}</div>
   <p>Last 7 days: {data.trend.recentAccuracy===null?'No answers':data.trend.recentAccuracy+'% accuracy'} ({data.trend.recentAttempts} answers). Previous 7 days: {data.trend.priorAccuracy===null?'No answers':data.trend.priorAccuracy+'%'} ({data.trend.priorAttempts} answers). {data.trend.change===null?'A trend appears after both periods have answers.':`${data.trend.change>0?'+':''}${data.trend.change} percentage points.`}</p></section>
   {['domain','career','pool','difficulty','format'].map(dimension=><section className="card" key={dimension}><h2>{({domain:'Domain mastery',career:'Career performance',pool:'Pool performance',difficulty:'Difficulty tiers',format:'Question formats'} as any)[dimension]}</h2>{Object.entries(data.dimensions[dimension]).length?<div className="insightsTableWrap"><table><thead><tr><th scope="col">{dimension}</th><th scope="col">Answers</th><th scope="col">Average answer score</th><th scope="col">Mastery</th></tr></thead><tbody>{Object.entries(data.dimensions[dimension]).map(([key,row]:[string,any])=><tr key={key}><th scope="row">{dimension==='career'?(scopeLabel(key)||'Unassigned career'):dimension==='pool'?(data.poolNames[key]||'Historical pool'):key.replaceAll('_',' ')}</th><td>{row.attempts}</td><td>{(row.accuracy*100).toFixed(1)}%</td><td><meter min="0" max="100" value={row.mastery} aria-label={`${key} mastery`} /> {row.mastery}%</td></tr>)}</tbody></table></div>:<p>No answers recorded for this scope yet.</p>}</section>)}
  </>}
 </div></main>;
}
