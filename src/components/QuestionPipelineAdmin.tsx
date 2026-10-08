'use client';
import { useEffect, useState, useRef } from 'react';
import { DIFFICULTY_TIERS } from '@/lib/contentPipeline';
import { canonicalTrainingTarget } from '@/lib/contentPools';
import { trainingDestinations, certificationLabel } from '@/lib/publishDestinations';
import { contentRequest } from '@/lib/contentRequest';
export default function QuestionPipelineAdmin({ view, onViewChange }: { view: string; onViewChange: (v: 'manage' | 'import' | 'review' | 'publish') => void }) {
  const [sets, setSets] = useState<any[]>([]), [setId, setSetId] = useState(''), [rows, setRows] = useState<any[]>([]), [issues, setIssues] = useState<any[]>([]);
  const [industry, setIndustry] = useState(''), [careerPath, setCareerPath] = useState(''), [name, setName] = useState(''), [lane, setLane] = useState('TRAINING'), [certExam, setCertExam] = useState('');
  const [catalog, setCatalog] = useState<any[]>([]), [placements, setPlacements] = useState<any[]>([]), [message, setMessage] = useState(''), [json, setJson] = useState(''), [editing, setEditing] = useState('');
  const [certifications, setCertifications] = useState<string[]>([]);
  const destinations = trainingDestinations(catalog, placements, sets);
  const request = contentRequest;
  const [loadedSetId, setLoadedSetId] = useState('');
  const generation = useRef(0);
  const refresh = async () => {
    const current = ++generation.current;
    const results = await Promise.allSettled([
      request('/api/admin/qsets'), request('/api/admin/placements'),
      setId ? request('/api/admin/questions?setId=' + encodeURIComponent(setId)) : Promise.resolve(null),
    ]);
    if (current !== generation.current) return;
    const [setsResult, placementsResult, questionsResult] = results;
    if (setsResult.status === 'fulfilled') setSets(setsResult.value.sets);
    if (placementsResult.status === 'fulfilled') { setPlacements(placementsResult.value.placements); setCertifications(placementsResult.value.certificationDestinations || []); }
    if (questionsResult.status === 'fulfilled' && questionsResult.value) {
      setRows(questionsResult.value.questions); setIssues(questionsResult.value.importIssues); setLoadedSetId(setId);
    }
    const failure = results.find(r => r.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  };
  const act = async (fn: () => Promise<any>) => { try { const d = await fn(); setMessage(typeof d === 'string' ? d : JSON.stringify(d)); await refresh(); } catch (e: any) { setMessage(e.message); } };
  useEffect(() => { void refresh().catch(e => setMessage(e.message)); }, [setId]);
  useEffect(() => { void request('/api/admin/careers').then(d => setCatalog(d.careers || [])).catch(() => {}); }, []);
  const choose = (id: string) => {
    setRows([]); setIssues([]); setLoadedSetId(''); setMessage(''); setEditing(''); setSetId(id);
    const pool = sets.find(s => s.id === id);
    const destination = placements.find(p => p.setId === id && p.isActive) || placements.find(p => p.setId === id);
    const target = canonicalTrainingTarget(destination?.lane === 'TRAINING' ? destination : pool || {});
    setIndustry(target.industry || pool?.industry || ''); setCareerPath(target.careerPath || pool?.careerPath || '');
    setLane(destination?.lane || 'TRAINING'); setCertExam(destination?.certExam || '');
  };
  const selected = sets.find(s => s.id === setId);
  return <div className="card adminQuestionBank" style={{ marginTop: 14 }}>
    <h2>Career → Question Pool → Questions → Review → Publish</h2>
    <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>{[['manage','Career & Pool'],['import','Questions'],['review','Review'],['publish','Publish']].map(([v,label]) => <button key={v} className={view === v ? 'primary' : ''} onClick={() => onViewChange(v as any)}>{label}</button>)}</div>
    <label>Industry <input list="pipeline-industries" value={industry} onChange={e => setIndustry(e.target.value)} /></label>
    <datalist id="pipeline-industries">{catalog.map((c: any, i) => <option key={i} value={c.industry} />)}</datalist>
    <label>Existing training destination <select value={destinations.some(d => d.industry === industry && d.careerPath === careerPath) ? JSON.stringify([industry, careerPath]) : ''} onChange={e => { if (e.target.value) { const [i, c] = JSON.parse(e.target.value); setIndustry(i); setCareerPath(c); } }}><option value="">Choose a career destination or enter a new one below</option>{destinations.map(d => <option key={JSON.stringify([d.industry,d.careerPath])} value={JSON.stringify([d.industry,d.careerPath])}>{d.industry} → {d.careerPath}</option>)}</select></label>
    <label>Career path <input value={careerPath} onChange={e => setCareerPath(e.target.value)} placeholder="New or existing career path" /></label>
    <label>Question pool <select value={setId} onChange={e => choose(e.target.value)}><option value="">Choose pool</option>{sets.filter(s => !industry || !s.industry || s.industry === industry).map(s => <option key={s.id} value={s.id}>{s.name} • {s.status} • {s._count?.questions || 0} total</option>)}</select></label>
    {view === 'manage' && <div className="row"><input placeholder="New pool name" value={name} onChange={e => setName(e.target.value)} /><button onClick={() => act(async () => { const d = await request('/api/admin/qsets','POST',{ name, domain: 'GENERAL', industry, careerPath }); setSetId(d.set.id); return 'Draft pool created'; })} disabled={!name.trim()}>Create draft pool</button></div>}
    {selected && loadedSetId !== setId && <p>Pool details unavailable or loading. Stored count: {selected._count?.questions || 0}.</p>}
    {selected && loadedSetId === setId && <p>{rows.filter(q => q.review.eligible).length} learner-ready / {rows.length} stored • {issues.length} import issues preserved</p>}
    {setId && (view === 'import' || view === 'review') && <>
      <p>Accepts question arrays and knowledge blocks (facts, definitions, commands and scenarios). Supported formats: multiple_choice, true_false, cli_command. Every import enters review. Invalid rows and duplicates are preserved in the import report.</p>
      {view === 'import' && <><input type="file" accept=".json,application/json" onChange={e => { const f = e.target.files?.[0]; if (f) void f.text().then(setJson); }} /><textarea rows={12} style={{ width: '100%' }} value={json} onChange={e => setJson(e.target.value)} placeholder={'[{"prompt":"Which action resolves this problem?","type":"multiple_choice","choices":["A","B"],"correctIndex":0,"difficulty":3,"explanation":"Explain why A resolves the problem."}]'} /><button onClick={() => act(async () => { const parsed = JSON.parse(json); if (editing) return request('/api/admin/questions','PATCH',{ ...parsed, id: editing }); const questions = Array.isArray(parsed) ? parsed : parsed.questions || [parsed]; return request('/api/admin/questions','POST',{ setId, questions }); })}>{editing ? 'Save edited question for review' : 'Import JSON / add question'}</button>{editing && <button onClick={() => { setEditing(''); setJson(''); }}>Cancel edit</button>}</>}
      <p>{DIFFICULTY_TIERS.map(t => `${t.value}: ${t.label}`).join(' • ')}. Golden and Boss require tier 4–5; difficulty is authored, never raised by eligibility.</p>
      {view === 'review' && <button onClick={() => { const ids=rows.filter(q=>!q.review.issues.length&&!q.review.duplicateOf&&(!q.data?.lifecycleStatus||q.data.lifecycleStatus==='ACTIVE')).map(q=>q.id); if (ids.length && window.confirm('Approve these valid active questions after reviewing their warnings?')) void act(()=>request('/api/admin/questions','PATCH',{ids,patch:{reviewStatus:'APPROVED'}})); }}>Approve reviewed valid questions</button>}
      <button onClick={() => { if (window.confirm('Archive all questions and unpublish this pool? Stored questions and history will be preserved.')) void act(() => request('/api/admin/questions','DELETE',{ setId, clearSet: true })); }}>Clear pool safely</button>
      {rows.map(q => <div key={q.id} className="card" style={{ marginTop: 10 }}><b>{q.prompt}</b><p>{q.type} • Tier {q.difficulty} • {q.data?.reviewStatus || 'Legacy'} • {q.data?.lifecycleStatus || 'ACTIVE'}</p><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify({ choices: q.choices, correctIndex: q.correctIndex, data: q.data, explanation: q.explanation },null,2)}</pre>{q.review.issues.length > 0 && <p>Quality: {q.review.issues.join('; ')}</p>}{q.review.warnings?.length > 0 && <p>Review warnings: {q.review.warnings.join("; ")}</p>}{q.review.duplicateOf && <p>Possible exact duplicate of {q.review.duplicateOf}. Review before approving.</p>}<div className="row" style={{ flexWrap: 'wrap', gap: 8 }}><button onClick={() => act(() => { const ids=rows.map(r=>r.id);const i=ids.indexOf(q.id);if(i>0)[ids[i-1],ids[i]]=[ids[i],ids[i-1]];return request('/api/admin/questions','PATCH',{setId,order:ids}); })}>Move up</button><button onClick={() => act(() => { const ids=rows.map(r=>r.id);const i=ids.indexOf(q.id);if(i<ids.length-1)[ids[i],ids[i+1]]=[ids[i+1],ids[i]];return request('/api/admin/questions','PATCH',{setId,order:ids}); })}>Move down</button><button onClick={() => { setEditing(q.id); setJson(JSON.stringify(q,null,2)); onViewChange('import'); }}>Edit question & answer</button><select value={q.difficulty} onChange={e => act(() => request('/api/admin/questions','PATCH',{ id: q.id, difficulty: Number(e.target.value) }))}>{DIFFICULTY_TIERS.map(t => <option key={t.value} value={t.value}>{t.value} — {t.label}</option>)}</select><button disabled={q.review.issues.length > 0} onClick={() => act(() => request('/api/admin/questions','PATCH',{ id: q.id, reviewStatus: 'APPROVED', lifecycleStatus: 'ACTIVE' }))}>Approve / restore</button><button onClick={() => act(() => request('/api/admin/questions','PATCH',{ id: q.id, reviewStatus: 'REJECTED' }))}>Reject</button><button onClick={() => act(() => request('/api/admin/questions','DELETE',{ id: q.id }))}>Archive</button></div></div>)}
      {issues.length > 0 && <details><summary>Preserved import issues ({issues.length})</summary>{issues.map(i => <div key={i.id}><p>Row {i.rowIndex}: {i.reason}</p><pre style={{ whiteSpace:'pre-wrap' }}>{JSON.stringify(i.payload,null,2)}</pre><button onClick={() => { setEditing(''); setJson(JSON.stringify(i.payload,null,2)); onViewChange('import'); }}>Repair and reimport</button></div>)}</details>}
    </>}
    {view === 'publish' && setId && <><p>Publish uses the same approved, supported questions learners receive. Archived, pending, rejected and malformed rows remain stored.</p><select value={lane} onChange={e => setLane(e.target.value)}><option>TRAINING</option><option>TEST_NOW</option><option>CERTIFICATIONS</option></select>{lane === 'CERTIFICATIONS' && <label>Certification destination <select value={certExam} onChange={e => setCertExam(e.target.value)}><option value="">Choose certification</option>{certifications.map(code => <option key={code} value={code}>{certificationLabel(code)}</option>)}</select></label>}<button disabled={loadedSetId !== setId || (lane === 'TRAINING' && (!industry.trim() || !careerPath.trim())) || (lane === 'CERTIFICATIONS' && !certExam)} onClick={() => act(() => request('/api/admin/placements','POST',{ setId, lane, industry, careerPath, certExam: certExam || null }))}>Publish pool</button>{placements.filter(p => p.setId === setId).map(p => <div key={p.id}><p>{p.lane} • {p.careerPath || p.certExam || p.set?.domain} • {p.isActive && p.set?.status === 'PUBLISHED' && rows.some(q=>q.review.eligible) ? 'Live' : 'Inactive'}</p>{p.isActive && <button onClick={() => act(() => request('/api/admin/placements','PATCH',{ id: p.id }))}>Unpublish destination</button>}</div>)}</>}
    {message && <p role="status" style={{ whiteSpace: 'pre-wrap' }}>{message}</p>}
  </div>;
}
