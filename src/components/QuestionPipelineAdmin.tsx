'use client';
import { useEffect, useState, useRef } from 'react';
import { DIFFICULTY_TIERS } from '@/lib/contentPipeline';
import { importEnvelope } from '@/lib/contentImport';
import { canonicalTrainingTarget } from '@/lib/contentPools';
import { trainingDestinations, certificationLabel } from '@/lib/publishDestinations';
import { importDestination } from '@/lib/importDestination';
import { contentRequest } from '@/lib/contentRequest';
export default function QuestionPipelineAdmin({ view, onViewChange }: { view: string; onViewChange: (v: 'manage' | 'import' | 'review' | 'publish') => void }) {
  const [sets, setSets] = useState<any[]>([]), [setId, setSetId] = useState(''), [rows, setRows] = useState<any[]>([]), [issues, setIssues] = useState<any[]>([]);
  const [industry, setIndustry] = useState(''), [careerPath, setCareerPath] = useState(''), [name, setName] = useState(''), [lane, setLane] = useState('TRAINING'), [certExam, setCertExam] = useState('');
  const [catalog, setCatalog] = useState<any[]>([]), [placements, setPlacements] = useState<any[]>([]), [message, setMessage] = useState(''), [json, setJson] = useState(''), [editing, setEditing] = useState('');
  const [certifications, setCertifications] = useState<string[]>([]);
  const destinations = trainingDestinations(catalog, placements, sets);
  const [busy, setBusy] = useState(false);
  const [domain, setDomain] = useState('GENERAL');
  const poolRef = useRef('');
  const busyRef = useRef(false);
  const [preview, setPreview] = useState<any>(null);
  const request = contentRequest;
  const [loadedSetId, setLoadedSetId] = useState('');
  const generation = useRef(0);
  const refresh = async (targetId = poolRef.current) => {
    const current = ++generation.current;
    const results = await Promise.allSettled([
      request('/api/admin/qsets'), request('/api/admin/placements'),
      targetId ? request('/api/admin/questions?setId=' + encodeURIComponent(targetId)) : Promise.resolve(null),
    ]);
    if (current !== generation.current) return;
    const [setsResult, placementsResult, questionsResult] = results;
    if (setsResult.status === 'fulfilled') setSets(setsResult.value.sets);
    if (placementsResult.status === 'fulfilled') { setPlacements(placementsResult.value.placements); setCertifications(placementsResult.value.certificationDestinations || []); }
    if (questionsResult.status === 'fulfilled' && questionsResult.value) {
      setRows(questionsResult.value.questions); setIssues(questionsResult.value.importIssues); setLoadedSetId(targetId);
    }
    const failure = results.find(r => r.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  };
  const act = async (fn: () => Promise<any>) => { if (busyRef.current) return; busyRef.current = true; setBusy(true); try { const d = await fn(); setMessage(typeof d === 'string' ? d : 'Saved. Pool details refreshed.'); await refresh(); } catch (e: any) { setMessage(e.message); } finally { busyRef.current = false; setBusy(false); } };
  useEffect(() => { void refresh().catch(e => setMessage(e.message)); }, [setId]);
  useEffect(() => { void request('/api/admin/careers').then(d => setCatalog(d.careers || [])).catch(() => {}); }, []);
  const choose = (id: string) => {
    generation.current++; poolRef.current = id; setPreview(null); setRows([]); setIssues([]); setLoadedSetId(''); setMessage(''); setEditing(''); setSetId(id);
    if (id === setId) void refresh(id).catch(e => setMessage(e.message));
    const pool = sets.find(s => s.id === id);
    const destination = placements.find(p => p.setId === id && p.isActive) || placements.find(p => p.setId === id);
    const target = canonicalTrainingTarget(destination?.lane === 'TRAINING' ? destination : pool || {});
    setIndustry(target.industry || pool?.industry || ''); setCareerPath(target.careerPath || pool?.careerPath || '');
    setDomain(pool?.domain || 'GENERAL');
    if (destination) { setLane(destination.lane); setCertExam(destination.certExam || ''); }
  };
  const applyMetadata = (text: string) => {
    try {
      const target = importDestination(JSON.parse(text));
      if (!target) { setMessage('Choose a destination and pool below. This JSON has no single bank destination.'); return; }
      if (target.lane === 'CERTIFICATIONS' && !certifications.includes(target.certExam)) {
        setMessage('This JSON names an unsupported certification. Choose a certification destination below.'); return;
      }
      const matches = sets.filter(s => s.name === target.name);
      choose(matches.length === 1 ? matches[0].id : '');
      setLane(target.lane); setCertExam(target.certExam); setIndustry(target.industry);
      setCareerPath(target.careerPath); setName(target.name); setDomain(target.domain);
      setMessage(matches.length === 1 ? 'JSON destination loaded. Confirm the selected pool before importing.' : 'JSON destination loaded. Choose an existing pool or import into a new draft pool.');
    } catch (e: any) { setMessage(e.message); }
  };
  const createPool = async () => {
    if (!name.trim()) throw new Error('Enter a new pool name or choose an existing pool.');
    const d = await request('/api/admin/qsets','POST',{ name, domain, industry, careerPath });
    poolRef.current = d.set.id; setSetId(d.set.id); setSets(previous => [d.set, ...previous]);
    return d.set.id;
  };
  const destinationValid = lane === 'CERTIFICATIONS' ? !!certExam : lane !== 'TRAINING' || !!(industry.trim() && careerPath.trim());
  const selected = sets.find(s => s.id === setId);
  return <div className="card adminQuestionBank" style={{ marginTop: 14 }}>
    <h2>Destination → Pool → Import → Review → Publish</h2>
    <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>{[['manage','Destination & Pool'],['import','Questions'],['review','Review'],['publish','Publish']].map(([v,label]) => <button key={v} className={view === v ? 'primary' : ''} onClick={() => onViewChange(v as any)}>{label}</button>)}</div>
    <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
    <label>Learner destination <select value={lane} onChange={e => { setLane(e.target.value); setPreview(null); }}><option value="TRAINING">Career Training</option><option value="CERTIFICATIONS">Certification Practice</option><option value="TEST_NOW">Test Now</option></select></label>
    {lane === 'CERTIFICATIONS' && <label>Certification destination <select value={certExam} onChange={e => setCertExam(e.target.value)}><option value="">Choose certification</option>{certifications.map(code => <option key={code} value={code}>{certificationLabel(code)}</option>)}</select></label>}
    {lane === 'TRAINING' && <>
    <label>Industry <input list="pipeline-industries" value={industry} onChange={e => setIndustry(e.target.value)} /></label>
    <datalist id="pipeline-industries">{catalog.map((c: any, i) => <option key={i} value={c.industry} />)}</datalist>
    <label>Existing training destination <select value={destinations.some(d => d.industry === industry && d.careerPath === careerPath) ? JSON.stringify([industry, careerPath]) : ''} onChange={e => { if (e.target.value) { const [i, c] = JSON.parse(e.target.value); setIndustry(i); setCareerPath(c); } }}><option value="">Choose a career destination or enter a new one below</option>{destinations.map(d => <option key={JSON.stringify([d.industry,d.careerPath])} value={JSON.stringify([d.industry,d.careerPath])}>{d.industry} → {d.careerPath}</option>)}</select></label>
    <label>Career path <input value={careerPath} onChange={e => setCareerPath(e.target.value)} placeholder="New or existing career path" /></label>
    </>}
    <label>Question pool <select value={setId} onChange={e => choose(e.target.value)}><option value="">Create a new draft pool</option>{sets.map(s => <option key={s.id} value={s.id}>{s.name} • {s.status} • {s._count?.questions || 0} total</option>)}</select></label>
    {!setId && <div className="row"><label>New pool name <input placeholder="e.g. Security+ SY0-701 Practice" value={name} onChange={e => setName(e.target.value)} /></label><button onClick={() => act(async () => { await createPool(); onViewChange('import'); return 'Draft pool created. Upload JSON below.'; })} disabled={!name.trim()}>Create draft pool</button></div>}
    <p>Questions are saved to the selected pool in the application database. Publishing makes its approved questions available in the selected learner destination.</p>
    {selected && loadedSetId !== setId && <p>Pool details unavailable or loading. Stored count: {selected._count?.questions || 0}.</p>}
    {selected && loadedSetId === setId && <p>{rows.filter(q => q.review.eligible).length} learner-ready / {rows.length} stored • {issues.length} import issues preserved</p>}
    {(view === 'import' || (setId && view === 'review')) && <>
      <p>Accepts question arrays and knowledge blocks (facts, definitions, commands and scenarios). Supported formats: multiple_choice, true_false, cli_command. Every import enters review. Invalid rows and duplicates are preserved in the import report.</p>
      {view === 'import' && <><input type="file" accept=".json,application/json" onChange={e => { const f = e.target.files?.[0]; if (f) { setPreview(null); setEditing(''); void f.text().then(text => { setJson(text); if (!setId) applyMetadata(text); else setMessage('File loaded into the selected pool. Use JSON destination if you want to change it.'); }).catch(e => setMessage(e.message)); } }} /><textarea rows={12} style={{ width: '100%' }} value={json} onChange={e => { setPreview(null); setJson(e.target.value); }} placeholder={'[{"prompt":"Which action resolves this problem?","type":"multiple_choice","choices":["A","B"],"correctIndex":0,"difficulty":3,"explanation":"Explain why A resolves the problem."}]'} /><button disabled={!json.trim() || !!editing} onClick={() => applyMetadata(json)}>Use JSON destination</button><button disabled={!setId || !json.trim() || !!editing || loadedSetId !== setId} onClick={async () => { try { setPreview(await request('/api/admin/content-preview','POST',{setId,questions:importEnvelope(JSON.parse(json))})); setMessage('Preview only: nothing has been saved.'); } catch (e:any) { setMessage(e.message); } }}>Preview generation & duplicates</button><button disabled={!json.trim() || (!setId && (!name.trim() || !destinationValid)) || (!!setId && loadedSetId !== setId)} onClick={() => act(async () => { const parsed = JSON.parse(json); if (editing) return request('/api/admin/questions','PATCH',{ ...parsed, id: editing }); const questions = importEnvelope(parsed); const targetId = setId || await createPool(); const result = await request('/api/admin/questions','POST',{ setId: targetId, questions }); onViewChange('review'); return `Imported ${result.inserted || 0} questions into the selected pool; ${result.skippedDuplicates || 0} duplicates skipped. ${result.quarantined || 0} items need repair. Review the questions below, then publish.`; })}>{editing ? 'Save edited question for review' : 'Import JSON to pool'}</button>{editing && <button onClick={() => { setEditing(''); setJson(''); }}>Cancel edit</button>}</>}
      {preview && <details open><summary>Preview: {preview.willInsert} new questions · {preview.duplicates} duplicates · {preview.issues.length} review issues</summary><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify({byDifficulty:preview.byDifficulty,byFormat:preview.byFormat,issues:preview.issues},null,2)}</pre>{preview.questions.slice(0,100).map((q:any,i:number)=><div className="card" key={i}><b>{q.prompt}</b><p>{q.type} · Tier {q.difficulty}</p><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify({choices:q.choices,correctIndex:q.correctIndex,expectedCommands:q.data?.expectedCommands,explanation:q.explanation,hints:q.data?.hints,wrongAnswerFollowUp:q.data?.derivedFromWrongAnswer ? {sourceChoice:q.data.sourceChoice,parentObjectiveId:q.data.parentObjectiveId} : undefined,sourceReferences:q.data?.sourceReferences},null,2)}</pre></div>)}</details>}
      <p>{DIFFICULTY_TIERS.map(t => `${t.value}: ${t.label}`).join(' • ')}. Golden and Boss require tier 4–5; difficulty is authored, never raised by eligibility.</p>
      {view === 'review' && <><button onClick={() => onViewChange('publish')}>Continue to publish</button><button onClick={() => { const ids=rows.filter(q=>!q.review.issues.length&&!q.review.duplicateOf&&(!q.data?.lifecycleStatus||q.data.lifecycleStatus==='ACTIVE')).map(q=>q.id); if (ids.length && window.confirm('Approve these valid active questions after reviewing their warnings?')) void act(()=>request('/api/admin/questions','PATCH',{ids,patch:{reviewStatus:'APPROVED'}})); }}>Approve reviewed valid questions</button></>}
      <button disabled={!setId || loadedSetId !== setId} onClick={() => { if (window.confirm('Archive all questions and unpublish this pool? Stored questions and history will be preserved.')) void act(() => request('/api/admin/questions','DELETE',{ setId, clearSet: true })); }}>Clear pool safely</button>
      {rows.map(q => <div key={q.id} className="card" style={{ marginTop: 10 }}><b>{q.prompt}</b><p>{q.type} • Tier {q.difficulty} • {q.data?.reviewStatus || 'Legacy'} • {q.data?.lifecycleStatus || 'ACTIVE'}</p><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify({ choices: q.choices, correctIndex: q.correctIndex, data: q.data, explanation: q.explanation },null,2)}</pre>{q.review.issues.length > 0 && <p>Quality: {q.review.issues.join('; ')}</p>}{q.review.warnings?.length > 0 && <p>Review warnings: {q.review.warnings.join("; ")}</p>}{q.review.duplicateOf && <p>Possible exact duplicate of {q.review.duplicateOf}. Review before approving.</p>}<div className="row" style={{ flexWrap: 'wrap', gap: 8 }}><button onClick={() => act(() => { const ids=rows.map(r=>r.id);const i=ids.indexOf(q.id);if(i>0)[ids[i-1],ids[i]]=[ids[i],ids[i-1]];return request('/api/admin/questions','PATCH',{setId,order:ids}); })}>Move up</button><button onClick={() => act(() => { const ids=rows.map(r=>r.id);const i=ids.indexOf(q.id);if(i<ids.length-1)[ids[i],ids[i+1]]=[ids[i+1],ids[i]];return request('/api/admin/questions','PATCH',{setId,order:ids}); })}>Move down</button><button onClick={() => { setEditing(q.id); setJson(JSON.stringify(q,null,2)); onViewChange('import'); }}>Edit question & answer</button><select value={q.difficulty} onChange={e => act(() => request('/api/admin/questions','PATCH',{ id: q.id, difficulty: Number(e.target.value) }))}>{DIFFICULTY_TIERS.map(t => <option key={t.value} value={t.value}>{t.value} — {t.label}</option>)}</select><button disabled={q.review.issues.length > 0} onClick={() => act(() => request('/api/admin/questions','PATCH',{ id: q.id, reviewStatus: 'APPROVED', lifecycleStatus: 'ACTIVE' }))}>Approve / restore</button><button onClick={() => act(() => request('/api/admin/questions','PATCH',{ id: q.id, reviewStatus: 'REJECTED' }))}>Reject</button><button onClick={() => act(() => request('/api/admin/questions','DELETE',{ id: q.id }))}>Archive</button></div></div>)}
      {issues.length > 0 && <details><summary>Preserved import issues ({issues.length})</summary>{issues.map(i => <div key={i.id}><p>Row {i.rowIndex}: {i.reason}</p><pre style={{ whiteSpace:'pre-wrap' }}>{JSON.stringify(i.payload,null,2)}</pre><button onClick={() => { setEditing(''); setJson(JSON.stringify(i.payload,null,2)); onViewChange('import'); }}>Repair and reimport</button></div>)}</details>}
    </>}
    {view === 'publish' && setId && <><p>Destination: {lane === 'CERTIFICATIONS' ? certificationLabel(certExam) : lane === 'TRAINING' ? `${industry} → ${careerPath}` : 'Test Now'} • Pool: {selected?.name}</p><p>Publish uses the same approved, supported questions learners receive. Archived, pending, rejected and malformed rows remain stored.</p><button disabled={!rows.some(q=>q.review.eligible) || loadedSetId !== setId || (lane === 'TRAINING' && (!industry.trim() || !careerPath.trim())) || (lane === 'CERTIFICATIONS' && !certExam)} onClick={() => act(() => request('/api/admin/placements','POST',{ setId, lane, industry, careerPath, certExam: certExam || null }))}>Publish pool</button>{placements.filter(p => p.setId === setId).map(p => <div key={p.id}><p>{p.lane} • {p.careerPath || p.certExam || p.set?.domain} • {p.isActive && p.set?.status === 'PUBLISHED' && rows.some(q=>q.review.eligible) ? 'Live' : 'Inactive'}</p>{p.isActive && <button onClick={() => act(() => request('/api/admin/placements','PATCH',{ id: p.id }))}>Unpublish destination</button>}</div>)}</>}
    </fieldset>
    {message && <p role="status" style={{ whiteSpace: 'pre-wrap' }}>{message}</p>}
  </div>;
}
