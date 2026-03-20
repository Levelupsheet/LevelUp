'use client';

import Link from 'next/link';
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
  rulesText?: string;
  rulesUrl?: string | null;
  totalEntries?: number;
  totalParticipants?: number;
  winner?: { displayName: string } | null;
  leaderboard?: Array<{ userId: string; displayName: string; quantity: number; isWinner?: boolean }>;
};

function Countdown({ endsAt }: { endsAt?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const label = useMemo(() => {
    if (!endsAt) return 'No draw date set';
    const diff = new Date(endsAt).getTime() - now;
    if (diff <= 0) return 'Drawing closed';
    const total = Math.floor(diff / 1000);
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${d}d ${h}h ${m}m ${s}s`;
  }, [endsAt, now]);
  return <div className="muted">Countdown: {label}</div>;
}

function SweepstakesModal({ campaign, user, onClose, onEntered }: { campaign: Campaign | null; user: any; onClose: ()=>void; onEntered: ()=>void; }) {
  if (!campaign) return null;
  async function enterTokens() {
    const res = await fetch('/api/sweepstakes/enter', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ campaignId: campaign.id, quantity: 1 }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      alert(data?.error || 'Could not enter sweepstakes');
      return;
    }
    onEntered();
  }
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)', display:'grid', placeItems:'center', zIndex:1000, padding:20 }} onClick={onClose}>
      <div className="glass" style={{ width:'min(920px, 96vw)', maxHeight:'90vh', overflow:'auto', padding:18 }} onClick={(e)=>e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center' }}>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Sweepstakes details</div>
            <h2 style={{ margin:'6px 0 0 0' }}>{campaign.title}</h2>
          </div>
          <button className="secondaryBtn" onClick={onClose}>Close</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1.1fr 1fr', gap:18, marginTop:16 }}>
          <div className="featureCard">
            <div><b>Prize</b></div>
            <div style={{ marginTop:8 }}>{campaign.prizePoolLabel || 'Prize drawing'}</div>
            <div className="muted" style={{ marginTop:8 }}>Prize value: ${Number(campaign.prizeValueUsd || 0).toFixed(2)}</div>
            <Countdown endsAt={campaign.endsAt} />
            <div className="muted" style={{ marginTop:8 }}>Entry method: {campaign.allowTokenEntry ? `${campaign.tokenCost || 0} tokens` : 'Not enabled'} {campaign.allowGoldenQuestion ? '• Golden question wins enabled' : ''}</div>
            {campaign.prizeUrl ? <div style={{ marginTop:10 }}><a href={campaign.prizeUrl} target="_blank" rel="noreferrer">View prize ↗</a></div> : null}
            <div style={{ marginTop: 14 }}>
              {campaign.status === 'DRAWN' && campaign.winner ? <div><b>Winner:</b> {campaign.winner.displayName}</div> : null}
              {campaign.allowTokenEntry ? <button className="gold" style={{ marginTop:12 }} onClick={enterTokens}>Enter with tokens</button> : null}
              {!campaign.allowTokenEntry && campaign.allowGoldenQuestion ? <div className="muted" style={{ marginTop:12 }}>Correctly answer golden questions in active sessions to earn entries for this drawing.</div> : null}
              {user ? <div className="muted" style={{ marginTop:8 }}>Your entries for current drawing: {Number(user?.campaignEntries || 0)}</div> : null}
            </div>
          </div>
          <div className="featureCard">
            <div><b>Terms and conditions</b></div>
            <div className="muted" style={{ whiteSpace:'pre-wrap', marginTop:8 }}>{campaign.rulesText || 'Rules will be published here for the live drawing.'}</div>
            {campaign.rulesUrl ? <div style={{ marginTop:10 }}><a href={campaign.rulesUrl} target="_blank" rel="noreferrer">Open full rules ↗</a></div> : null}
          </div>
        </div>
        <div className="featureCard" style={{ marginTop:16 }}>
          <b>Entry leaderboard</b>
          <div style={{ display:'grid', gap:8, marginTop:10 }}>
            {Array.isArray(campaign.leaderboard) && campaign.leaderboard.length ? campaign.leaderboard.slice(0,25).map((row, idx) => (
              <div key={`${row.userId}-${idx}`} style={{ display:'flex', justifyContent:'space-between', gap:10, padding:'8px 10px', borderRadius:10, border:'1px solid rgba(255,255,255,.08)', background: row.isWinner ? 'rgba(90,200,120,.12)' : 'rgba(255,255,255,.03)' }}>
                <div>{idx+1}. {row.displayName} {row.isWinner ? '🏆' : ''}</div>
                <div>{row.quantity} entries</div>
              </div>
            )) : <div className="muted">No entries yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SweepstakesPage() {
  const [data, setData] = useState<any>({ campaigns: [], current: null, user: null });
  const [selected, setSelected] = useState<Campaign | null>(null);

  async function load() {
    const res = await fetch('/api/sweepstakes/summary', { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    setData(json?.ok ? json : { campaigns: [], current: null, user: null });
  }
  useEffect(() => { load(); }, []);

  const campaigns: Campaign[] = Array.isArray(data?.campaigns) ? data.campaigns : [];
  const active = campaigns.filter((c) => c?.status === 'ACTIVE' || c?.isLive);
  const past = campaigns.filter((c) => c?.status !== 'ACTIVE' && !c?.isLive);

  return (
    <main style={{ minHeight: '100vh' }} className="dashboardBg">
      <div className="dashWrap" style={{ paddingTop: 96, paddingBottom: 48 }}>
        <div className="glass" style={{ padding: 18 }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', alignItems:'center' }}>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>Sweepstakes</div>
              <h1 style={{ margin:'6px 0 0 0', fontSize: 28, fontWeight: 900 }}>Live sweepstakes</h1>
              <div className="muted" style={{ marginTop: 8, maxWidth: 920 }}>
                Use earned tokens to enter eligible drawings, or unlock entries through golden-question wins when enabled for that campaign.
              </div>
            </div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <Link className="secondaryBtn" href="/start">Back to Start</Link>
              <Link className="gold" href="/dashboard">Go to Dashboard →</Link>
            </div>
          </div>

          <div className="featureCard" style={{ marginTop:16 }}>
            <b>Your sweepstakes balance</b>
            <div className="muted" style={{ marginTop:8 }}>Tokens: {Number(data?.user?.tokenBalance || 0)} • Entries this week: {Number(data?.user?.weeklyCount || 0)} / {Number(data?.user?.weeklyLimit || 0)}</div>
          </div>

          <div style={{ marginTop: 18 }}>
            <h3 style={{ marginBottom: 10 }}>Active drawings</h3>
            <div className="grid3">
              {active.length ? active.map((c) => (
                <button key={c.id} type="button" className="featureCard" style={{ textAlign:'left' }} onClick={() => setSelected(c)}>
                  <b>{c.title}</b>
                  <div className="muted" style={{ marginTop:8 }}>{c.prizePoolLabel || 'Prize drawing'} • ${Number(c.prizeValueUsd || 0).toFixed(2)}</div>
                  <div className="muted" style={{ marginTop:6 }}>{c.allowTokenEntry ? `${c.tokenCost || 0} tokens to enter` : 'Token entry disabled'} {c.allowGoldenQuestion ? '• Golden entries enabled' : ''}</div>
                  <div className="muted" style={{ marginTop:6 }}>Ends: {c.endsAt ? new Date(c.endsAt).toLocaleString() : 'TBD'}</div>
                </button>
              )) : <div className="featureCard"><b>No sweepstakes loaded yet.</b></div>}
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <h3 style={{ marginBottom: 10 }}>Past drawings</h3>
            <div className="grid3">
              {past.length ? past.map((c) => (
                <button key={c.id} type="button" className="featureCard" style={{ textAlign:'left' }} onClick={() => setSelected(c)}>
                  <b>{c.title}</b>
                  <div className="muted" style={{ marginTop:8 }}>{c.prizePoolLabel || 'Prize drawing'}</div>
                  <div className="muted" style={{ marginTop:6 }}>Winner: {c.winner?.displayName || 'Pending'}</div>
                  <div className="muted" style={{ marginTop:6 }}>Drawn: {c.drawnAt ? new Date(c.drawnAt).toLocaleString() : 'Not drawn yet'}</div>
                </button>
              )) : <div className="featureCard"><b>No past drawings yet.</b></div>}
            </div>
          </div>
        </div>
      </div>
      <SweepstakesModal campaign={selected} user={data?.user} onClose={() => setSelected(null)} onEntered={() => { setSelected(null); load(); }} />
    </main>
  );
}
