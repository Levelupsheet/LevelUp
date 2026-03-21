'use client';

import { useEffect, useMemo, useState } from 'react';

type Campaign = {
  id: string;
  title: string;
  status: string;
  isLive?: boolean;
  startsAt?: string;
  endsAt?: string;
  drawnAt?: string | null;
  prizePoolLabel?: string | null;
  prizeValueUsd?: number;
  tokenCost?: number;
  allowTokenEntry?: boolean;
  allowGoldenQuestion?: boolean;
  prizeUrl?: string | null;
  prizeImageUrl?: string | null;
  rulesText?: string;
  rulesUrl?: string | null;
  winner?: { displayName: string } | null;
  leaderboard?: Array<{ userId: string; displayName: string; quantity: number; isWinner?: boolean }>;
  totalEntries?: number;
};

function toLocalInput(v?: string | null) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminSweepstakesPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [status, setStatus] = useState('');
  const selected = useMemo(() => campaigns.find((c) => c.id === selectedId) || campaigns[0] || null, [campaigns, selectedId]);
  const [form, setForm] = useState<any>({ title:'', prizePoolLabel:'', prizeValueUsd:0, tokenCost:0, allowTokenEntry:true, allowGoldenQuestion:false, prizeUrl:'', prizeImageUrl:'', rulesText:'', rulesUrl:'', startsAt:'', endsAt:'', isLive:true, status:'ACTIVE' });

  async function loadCampaigns(preserveId?: string) {
    const res = await fetch('/api/admin/sweepstakes/campaign', { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (data?.ok) {
      const rows = Array.isArray(data?.campaigns) ? data.campaigns : data?.campaign ? [data.campaign] : [];
      setCampaigns(rows);
      const nextId = preserveId || data?.campaign?.id || rows[0]?.id || '';
      setSelectedId(nextId);
      const current = rows.find((r: Campaign) => r.id === nextId) || rows[0] || null;
      if (current) hydrate(current);
    }
  }

  function hydrate(c: Campaign) {
    setForm({
      id: c.id,
      title: c.title || '',
      prizePoolLabel: c.prizePoolLabel || '',
      prizeValueUsd: Number(c.prizeValueUsd || 0),
      tokenCost: Number(c.tokenCost || 0),
      allowTokenEntry: Boolean(c.allowTokenEntry),
      allowGoldenQuestion: Boolean(c.allowGoldenQuestion),
      prizeUrl: c.prizeUrl || '',
      prizeImageUrl: c.prizeImageUrl || '',
      rulesText: c.rulesText || '',
      rulesUrl: c.rulesUrl || '',
      startsAt: toLocalInput(c.startsAt),
      endsAt: toLocalInput(c.endsAt),
      isLive: c.isLive !== false,
      status: c.status || 'ACTIVE',
    });
  }

  useEffect(() => { loadCampaigns(); }, []);
  useEffect(() => { if (selected) hydrate(selected); }, [selectedId]);

  async function saveCampaign(e: React.FormEvent) {
    e.preventDefault();
    setStatus('Saving...');
    const res = await fetch('/api/admin/sweepstakes/campaign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setStatus(data?.ok ? 'Campaign updated.' : [data?.error || 'Failed to update campaign', data?.detail].filter(Boolean).join(': '));
    if (data?.ok) loadCampaigns(data?.campaign?.id || form.id);
  }

  async function drawWinner() {
    setStatus('Drawing winner...');
    const res = await fetch('/api/admin/sweepstakes/draw', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ campaignId: selected?.id }) });
    const data = await res.json().catch(() => ({}));
    setStatus(data?.ok ? (data?.winner ? `Winner drawn: ${data.winner.user?.displayName || data.winner.user?.email || data.winner.userId}` : 'No eligible entries to draw from.') : [data?.error || 'Draw failed.', data?.detail].filter(Boolean).join(': '));
    await loadCampaigns(selected?.id);
  }

  function newCampaign() {
    setSelectedId('');
    setForm({ title:'New Sweepstakes', prizePoolLabel:'', prizeValueUsd:0, tokenCost:0, allowTokenEntry:true, allowGoldenQuestion:false, prizeUrl:'', prizeImageUrl:'', rulesText:'', rulesUrl:'', startsAt:toLocalInput(new Date().toISOString()), endsAt:toLocalInput(new Date(Date.now()+7*24*60*60*1000).toISOString()), isLive:true, status:'ACTIVE' });
    setStatus('New draft ready. Save to create it.');
  }

  return (
    <main className="dashboardBg" style={{ minHeight: '100vh' }}>
      <div className="dashWrap" style={{ paddingTop: 96, paddingBottom: 40 }}>
        <div className="glass" style={{ padding: 18 }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', alignItems:'center' }}>
            <div>
              <h1 style={{ margin:'0 0 6px 0' }}>Sweepstakes Admin</h1>
              <div className="muted">Create and manage active/past drawings, token-cost entry settings, prize links, terms, and winner history.</div>
            </div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <button className="secondaryBtn" onClick={() => loadCampaigns(selected?.id)}>Refresh</button>
              <button className="secondaryBtn" onClick={newCampaign}>New campaign</button>
              <button className="gold" onClick={drawWinner} disabled={!selected?.id}>Draw winner now</button>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1.2fr 1fr', gap:18, marginTop: 18 }}>
            <form onSubmit={saveCampaign} className="featureCard" style={{ display:'grid', gap:10 }}>
              <b>Campaign settings</b>
              <label><small>Title</small><input value={form.title || ''} onChange={(e)=>setForm((s:any)=>({ ...s, title: e.target.value }))} /></label>
              <label><small>Prize pool label</small><input value={form.prizePoolLabel || ''} onChange={(e)=>setForm((s:any)=>({ ...s, prizePoolLabel: e.target.value }))} /></label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <label><small>Prize value $</small><input type="number" min={0} step="0.01" value={form.prizeValueUsd || 0} onChange={(e)=>setForm((s:any)=>({ ...s, prizeValueUsd: Number(e.target.value || 0) }))} /></label>
                <label><small>Token cost</small><input type="number" min={0} value={form.tokenCost || 0} onChange={(e)=>setForm((s:any)=>({ ...s, tokenCost: Number(e.target.value || 0) }))} /></label>
              </div>
              <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                <label><input type="checkbox" checked={!!form.allowTokenEntry} onChange={(e)=>setForm((s:any)=>({ ...s, allowTokenEntry: e.target.checked }))} /> Token entry</label>
                <label><input type="checkbox" checked={!!form.allowGoldenQuestion} onChange={(e)=>setForm((s:any)=>({ ...s, allowGoldenQuestion: e.target.checked }))} /> Golden questions award entries</label>
                <label><input type="checkbox" checked={!!form.isLive} onChange={(e)=>setForm((s:any)=>({ ...s, isLive: e.target.checked }))} /> Live</label>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <label><small>Start date</small><input type="datetime-local" value={form.startsAt || ''} onChange={(e)=>setForm((s:any)=>({ ...s, startsAt: e.target.value }))} /></label>
                <label><small>End date / draw closes</small><input type="datetime-local" value={form.endsAt || ''} onChange={(e)=>setForm((s:any)=>({ ...s, endsAt: e.target.value }))} /></label>
              </div>
              <label><small>Prize link or image URL</small><input value={form.prizeUrl || ''} onChange={(e)=>setForm((s:any)=>({ ...s, prizeUrl: e.target.value }))} /></label>
              <label><small>Rules / terms URL (optional)</small><input value={form.rulesUrl || ''} onChange={(e)=>setForm((s:any)=>({ ...s, rulesUrl: e.target.value }))} /></label>
              <label><small>Terms and conditions</small><textarea rows={6} value={form.rulesText || ''} onChange={(e)=>setForm((s:any)=>({ ...s, rulesText: e.target.value }))} /></label>
              <div><button className="primaryBtn" type="submit">Save campaign</button></div>
            </form>

            <div className="featureCard" style={{ display:'grid', gap:10 }}>
              <b>All drawings</b>
              <div style={{ display:'grid', gap:8, maxHeight: 720, overflow:'auto' }}>
                {(campaigns || []).map((row) => (
                  <button key={row.id} type="button" onClick={() => { setSelectedId(row.id); hydrate(row); }} style={{ textAlign:'left', padding: 12, borderRadius: 12, border: row.id===selectedId ? '1px solid rgba(120,200,255,.6)' : '1px solid rgba(255,255,255,.08)', background:'rgba(255,255,255,0.03)' }}>
                    <div style={{ fontWeight:700 }}>{row.title}</div>
                    <div className="muted">{row.status} • {row.startsAt ? new Date(row.startsAt).toLocaleString() : '—'} → {row.endsAt ? new Date(row.endsAt).toLocaleString() : '—'}</div>
                    <div className="muted">Winner: {row.winner?.displayName || 'Pending'} • Entries: {row.totalEntries || 0}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {selected ? (
            <div className="featureCard" style={{ marginTop: 16 }}>
              <b>Entry leaderboard</b>
              <div style={{ marginTop: 10, display:'grid', gap:8 }}>
                {Array.isArray(selected.leaderboard) && selected.leaderboard.length ? selected.leaderboard.slice(0, 25).map((row, idx) => (
                  <div key={`${row.userId}-${idx}`} style={{ display:'flex', justifyContent:'space-between', gap:10, padding:'8px 10px', borderRadius:10, border:'1px solid rgba(255,255,255,.08)', background: row.isWinner ? 'rgba(90,200,120,.12)' : 'rgba(255,255,255,.03)' }}>
                    <div>{idx + 1}. {row.displayName} {row.isWinner ? '🏆' : ''}</div>
                    <div>{row.quantity} entries</div>
                  </div>
                )) : <div className="muted">No entries yet.</div>}
              </div>
            </div>
          ) : null}

          {status ? <div className="muted" style={{ marginTop: 14 }}>{status}</div> : null}
        </div>
      </div>
    </main>
  );
}
