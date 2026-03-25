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

type UserSummary = {
  tokenBalance?: number;
  weeklyCount?: number;
  weeklyLimit?: number;
  campaignEntries?: number;
  entriesByCampaign?: Record<string, number>;
  activeEnteredCampaignIds?: string[];
};

function formatCountdown(endsAt?: string, now: number = Date.now()) {
  if (!endsAt) return 'No draw date set';
  const diff = new Date(endsAt).getTime() - now;
  if (diff <= 0) return 'Drawing closed';
  const total = Math.floor(diff / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${d}d ${h}h ${m}m ${s}s`;
}

function Countdown({ endsAt, compact = false }: { endsAt?: string; compact?: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const label = useMemo(() => formatCountdown(endsAt, now), [endsAt, now]);
  return <div className={compact ? 'badge' : 'muted'} style={compact ? undefined : { marginTop: 8 }}>⏳ {label}</div>;
}

function looksLikeImage(url?: string | null) {
  const v = String(url || '').toLowerCase();
  return /(\.png|\.jpe?g|\.gif|\.webp|\.svg)(\?|$)/.test(v);
}

function TermsModal({ campaign, onClose }: { campaign: Campaign | null; onClose: () => void }) {
  if (!campaign) return null;
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(2,6,16,.88)', display:'grid', placeItems:'center', zIndex:1100, padding:20 }} onClick={onClose}>
      <div className="glass" style={{ width:'min(840px, 96vw)', maxHeight:'88vh', overflow:'auto', padding:20 }} onClick={(e)=>e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center' }}>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Terms and conditions</div>
            <h3 style={{ margin:'6px 0 0 0' }}>{campaign.title}</h3>
          </div>
          <button className="secondaryBtn" onClick={onClose}>Close</button>
        </div>
        <div className="featureCard" style={{ marginTop: 14 }}>
          <div style={{ whiteSpace:'pre-wrap', lineHeight:1.6 }}>{campaign.rulesText || 'Rules will be published here for the live drawing.'}</div>
          {campaign.rulesUrl ? <div style={{ marginTop: 12 }}><a href={campaign.rulesUrl} target="_blank" rel="noreferrer">Open full rules ↗</a></div> : null}
        </div>
      </div>
    </div>
  );
}



function RaffleReel({ campaign }: { campaign: Campaign | null }) {
  const entries = Array.isArray(campaign?.leaderboard)
    ? campaign!.leaderboard!.flatMap((row) => Array.from({ length: Math.max(1, Number(row.quantity || 1)) }, () => row.displayName))
    : [];
  const names = entries.length ? entries : ['Waiting for entries'];
  const winnerName = campaign?.winner?.displayName || null;
  const [index, setIndex] = useState(0);

  function centerIndexForName(list: string[], name: string | null) {
    if (!name || !list.length) return 0;
    const target = list.findIndex((n) => n === name);
    if (target < 0) return 0;
    return (target - 3 + list.length) % list.length;
  }

  useEffect(() => {
    if (!campaign) return;
    if (winnerName) {
      setIndex(centerIndexForName(names, winnerName));
      return;
    }
    let idx = 0;
    let timer: any;
    const tick = () => {
      idx += 1;
      setIndex(idx % names.length);
      const delay = idx % 18 > 12 ? 260 : 120;
      timer = setTimeout(tick, delay);
    };
    tick();
    return () => clearTimeout(timer);
  }, [campaign?.id, winnerName, names.join('|')]);

  const visible = Array.from({ length: 7 }, (_, i) => names[(index + i + names.length) % names.length]);

  return (
    <div className="featureCard" style={{ marginTop: 14, padding: 14, background: 'linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02))' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, marginBottom:10 }}>
        <b>{winnerName ? 'Winner reel' : 'Live entry reel'}</b>
        <span className="badge" style={{ borderColor:'rgba(255,215,90,.35)', color:'#ffe28a' }}>{winnerName ? 'Locked on winner' : 'Drawing tease'}</span>
      </div>
      <div style={{ perspective: 1000, overflow: 'hidden', borderRadius: 16, border:'1px solid rgba(255,255,255,.08)', background:'radial-gradient(circle at top, rgba(255,215,90,.12), transparent 35%), rgba(5,8,18,.86)', minHeight: 360 }}>
        <div style={{ display:'grid', gap:8, padding:14 }}>
          {visible.map((name, i) => {
            const isCenter = i === 3;
            const isWinner = Boolean(winnerName) && name === winnerName && isCenter;
            return (
              <div key={`${name}-${i}-${index}`} style={{
                transform: `rotateX(${(i - 3) * 10}deg) scale(${isCenter ? 1 : 0.92})`,
                transformOrigin: 'center center',
                opacity: isCenter ? 1 : 0.52,
                padding:'10px 14px',
                borderRadius:12,
                border: isWinner ? '1px solid rgba(255,215,90,.55)' : '1px solid rgba(255,255,255,.08)',
                background: isWinner ? 'linear-gradient(90deg, rgba(255,215,90,.22), rgba(255,255,255,.04))' : 'rgba(255,255,255,.03)',
                color: isCenter ? '#fff' : 'rgba(255,255,255,.72)',
                fontWeight: isCenter ? 800 : 600,
                boxShadow: isWinner ? '0 0 24px rgba(255,215,90,.18)' : 'none',
              }}>
                {name}
              </div>
            );
          })}
        </div>
      </div>
      <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
        {winnerName ? 'The reel is locked on the selected winner.' : 'The actual winner is still drawn randomly from the live entries pool.'}
      </div>
    </div>
  );
}
function SweepstakesModal({ campaign, user, onClose, onEntered }: { campaign: Campaign | null; user: UserSummary | null; onClose: ()=>void; onEntered: ()=>void; }) {
  const [showTerms, setShowTerms] = useState(false);
  const [confirmingEntry, setConfirmingEntry] = useState(false);
  if (!campaign) return null;

  const tokenCost = Math.max(0, Number(campaign.tokenCost || 0));
  const balance = Math.max(0, Number(user?.tokenBalance || 0));
  const nextBalance = Math.max(0, balance - tokenCost);
  const canAfford = balance >= tokenCost;

  async function enterTokens() {
    if (!confirmingEntry) {
      setConfirmingEntry(true);
      return;
    }

    const res = await fetch('/api/sweepstakes/enter', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ campaignId: campaign.id, quantity: 1 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      setConfirmingEntry(false);
      alert(data?.error || 'Could not enter sweepstakes');
      return;
    }
    setConfirmingEntry(false);
    onEntered();
  }

  return (
    <>
      <div style={{ position:'fixed', inset:0, background:'rgba(2,6,16,.88)', display:'grid', placeItems:'center', zIndex:1000, padding:20 }} onClick={onClose}>
        <div className="glass" style={{ width:'min(1040px, 96vw)', maxHeight:'90vh', overflow:'auto', padding:20, boxShadow:'0 30px 100px rgba(0,0,0,.72)', background:'linear-gradient(180deg, rgba(8,12,24,.98), rgba(8,12,24,.96))', border:'1px solid rgba(255,255,255,.08)'  }} onClick={(e)=>e.stopPropagation()}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center' }}>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>Sweepstakes details</div>
              <h2 style={{ margin:'6px 0 0 0' }}>{campaign.title}</h2>
            </div>
            <button className="secondaryBtn" onClick={onClose}>Close</button>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1.15fr 1fr', gap:18, marginTop:16 }} className="sweepModalGrid">
            <div className="featureCard" style={{ position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', inset:0, background:'radial-gradient(circle at top right, rgba(251,191,36,.22), transparent 44%), rgba(0,0,0,.22)', pointerEvents:'none' }} />
              <div style={{ position:'relative' }}>
                <div><b>Prize</b></div>
                <div style={{ marginTop:8, fontSize:24, fontWeight:900 }}>{campaign.prizePoolLabel || 'Prize drawing'}</div>
                <div className="muted" style={{ marginTop:8 }}>Prize value: ${Number(campaign.prizeValueUsd || 0).toFixed(2)}</div>
                <Countdown endsAt={campaign.endsAt} />
                <div className="muted" style={{ marginTop:8 }}>Entry method: {campaign.allowTokenEntry ? `${campaign.tokenCost || 0} tokens` : 'Not enabled'} {campaign.allowGoldenQuestion ? '• Golden entries enabled' : ''}</div>
                {campaign.prizeUrl ? (
                  <div style={{ marginTop: 14 }}>
                    {looksLikeImage(campaign.prizeUrl) ? (
                      <a href={campaign.prizeUrl} target="_blank" rel="noreferrer" style={{ display:'block' }}>
                        <img src={campaign.prizeUrl} alt={campaign.prizePoolLabel || 'Prize'} style={{ width:'100%', maxHeight:260, objectFit:'cover', borderRadius:14, border:'1px solid rgba(255,255,255,.08)' }} />
                      </a>
                    ) : (
                      <a href={campaign.prizeUrl} target="_blank" rel="noreferrer">View prize ↗</a>
                    )}
                  </div>
                ) : null}
                <div style={{ marginTop: 16, display:'flex', gap:10, flexWrap:'wrap' }}>
                  {campaign.allowTokenEntry ? (
                    <button className="gold" onClick={enterTokens} disabled={!canAfford} title={!canAfford ? 'Not enough tokens' : undefined}>
                      {confirmingEntry ? 'Confirm entry' : 'Enter with tokens'}
                    </button>
                  ) : null}
                  <button className="secondaryBtn" onClick={() => setShowTerms(true)}>Terms</button>
                </div>
                {confirmingEntry ? (
                  <div className="featureCard" style={{ marginTop: 12, borderColor:'rgba(255,215,90,.28)' }}>
                    <b>Confirm entry</b>
                    <div className="muted" style={{ marginTop: 8 }}>This entry costs <b>{tokenCost}</b> tokens. Current balance: <b>{balance}</b>. After entry: <b>{nextBalance}</b>.</div>
                    <div style={{ display:'flex', gap:10, marginTop:12 }}>
                      <button className="gold" onClick={enterTokens}>Confirm</button>
                      <button className="secondaryBtn" onClick={() => setConfirmingEntry(false)}>Cancel</button>
                    </div>
                  </div>
                ) : null}
                {campaign.allowTokenEntry ? (
                  <div className="muted" style={{ marginTop: 10 }}>
                    This entry costs <b>{tokenCost}</b> tokens. Current balance: <b>{balance}</b>. After entry: <b>{nextBalance}</b>.
                  </div>
                ) : null}
                {!campaign.allowTokenEntry && campaign.allowGoldenQuestion ? <div className="muted" style={{ marginTop:12 }}>Correctly answer golden questions in active sessions to earn entries for this drawing.</div> : null}
                {campaign.status === 'DRAWN' && campaign.winner ? <div style={{ marginTop:12 }}><b>Winner:</b> {campaign.winner.displayName}</div> : null}
                {user ? <div className="muted" style={{ marginTop:8 }}>Your entries for current drawing: {Number(user?.entriesByCampaign?.[String(campaign.id)] || 0)}</div> : null}
              </div>
            </div>
            <div className="featureCard">
              <div><b>Live details</b></div>
              <div className="muted" style={{ marginTop:10 }}>Starts: {campaign.startsAt ? new Date(campaign.startsAt).toLocaleString() : 'TBD'}</div>
              <div className="muted" style={{ marginTop:6 }}>Ends: {campaign.endsAt ? new Date(campaign.endsAt).toLocaleString() : 'TBD'}</div>
              <div className="muted" style={{ marginTop:6 }}>Entries: {Number(campaign.totalEntries || 0)} • Participants: {Number(campaign.totalParticipants || 0)}</div>
              <div className="featureCard" style={{ marginTop:14, background:'rgba(255,255,255,.02)' }}>
                <b>Entry leaderboard</b>
                <div style={{ display:'grid', gap:8, marginTop:10 }}>
                  {Array.isArray(campaign.leaderboard) && campaign.leaderboard.length ? campaign.leaderboard.slice(0,10).map((row, idx) => (
                    <div key={`${row.userId}-${idx}`} style={{ display:'flex', justifyContent:'space-between', gap:10, padding:'8px 10px', borderRadius:10, border:'1px solid rgba(255,255,255,.08)', background: row.isWinner ? 'rgba(90,200,120,.12)' : 'rgba(255,255,255,.03)' }}>
                      <div>{idx+1}. {row.displayName} {row.isWinner ? '🏆' : ''}</div>
                      <div>{row.quantity} entries</div>
                    </div>
                  )) : <div className="muted">No entries yet.</div>}
                </div>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}><RaffleReel campaign={campaign} /></div>
        </div>
      </div>
      <TermsModal campaign={showTerms ? campaign : null} onClose={() => setShowTerms(false)} />
    </>
  );
}

export default function SweepstakesPage() {
  const [data, setData] = useState<any>({ campaigns: [], current: null, user: null });
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [pendingCampaignId, setPendingCampaignId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authed, setAuthed] = useState(false);

  async function load() {
    const authRes = await fetch('/api/auth/me', { cache: 'no-store' as any }).catch(() => null as any);
    if (!authRes || !authRes.ok) {
      setAuthed(false);
      setAuthChecked(true);
      return;
    }
    setAuthed(true);
    setAuthChecked(true);
    const res = await fetch('/api/sweepstakes/summary', { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    setData(json?.ok ? json : { campaigns: [], current: null, user: null });
  }
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setPendingCampaignId(params.get('campaign'));
    } catch {}
    load();
  }, []);

  const campaigns: Campaign[] = Array.isArray(data?.campaigns) ? data.campaigns : [];
  const active = campaigns.filter((c) => c?.status === 'ACTIVE' || c?.isLive);
  const past = campaigns.filter((c) => c?.status !== 'ACTIVE' && !c?.isLive);

  useEffect(() => {
    if (!pendingCampaignId || !campaigns.length) return;
    const match = campaigns.find((campaign) => String(campaign.id) === String(pendingCampaignId));
    if (!match) return;
    setSelected(match);
    const timer = window.setTimeout(() => {
      const el = document.getElementById(`campaign-${match.id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [pendingCampaignId, campaigns]);

  if (!authChecked) {
    return <main style={{ minHeight: '100vh' }} className="dashboardBg"><div className="dashWrap" style={{ paddingTop: 120 }}><div className="glass" style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>Loading sweepstakes…</div></div></main>;
  }

  if (authChecked && !authed) {
    return (
      <main style={{ minHeight: '100vh' }} className="dashboardBg">
        <div className="dashWrap" style={{ paddingTop: 120, paddingBottom: 48 }}>
          <div className="glass" style={{ padding: 24, maxWidth: 780, margin: '0 auto' }}>
            <h1 style={{ margin: 0 }}>Sign in required</h1>
            <p className="muted" style={{ marginTop: 10 }}>Please sign in through the dashboard before viewing or entering sweepstakes drawings.</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <Link className="gold" href="/dashboard">Go to Dashboard →</Link>
              <Link className="secondaryBtn" href="/start">Back to Start</Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh' }} className="dashboardBg">
      <div className="dashWrap" style={{ paddingTop: 96, paddingBottom: 48 }}>
        <div className="glass" style={{ padding: 20, overflow:'hidden', position:'relative' }}>
          <div style={{ position:'absolute', inset:0, background:'radial-gradient(circle at top right, rgba(59,130,246,.12), transparent 35%), radial-gradient(circle at bottom left, rgba(251,191,36,.10), transparent 30%)', pointerEvents:'none' }} />
          <div style={{ position:'relative' }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', alignItems:'center' }}>
              <div>
                <div className="muted" style={{ fontSize: 12 }}>Sweepstakes</div>
                <h1 style={{ margin:'6px 0 0 0', fontSize: 34, fontWeight: 900 }}>Live sweepstakes</h1>
                <div className="muted" style={{ marginTop: 8, maxWidth: 920, fontSize: 18, lineHeight: 1.5 }}>
                  Use earned tokens to enter eligible drawings, or unlock entries through golden-question wins when enabled for that campaign.
                </div>
              </div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                <Link className="secondaryBtn" href="/start">Back to Start</Link>
                <Link className="gold" href="/dashboard">Go to Dashboard →</Link>
              </div>
            </div>

            <div className="featureCard" style={{ marginTop:18, display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', alignItems:'center' }}>
              <div>
                <b>Your sweepstakes balance</b>
                <div className="muted" style={{ marginTop:8, fontSize: 16 }}>Tokens: {Number(data?.user?.tokenBalance || 0)} • Entries this week: {Number(data?.user?.weeklyCount || 0)} / {Number(data?.user?.weeklyLimit || 0)}</div>
              </div>
              {active[0] ? <Countdown endsAt={active[0]?.endsAt} compact /> : null}
            </div>

            <div style={{ marginTop: 22 }}>
              <h3 style={{ marginBottom: 12, fontSize: 24 }}>Active drawings</h3>
              <div className="grid3">
                {active.length ? active.map((c) => (
                  <button key={c.id} id={`campaign-${c.id}`} type="button" className="featureCard" style={{ textAlign:'left', position:'relative', overflow:'hidden', scrollMarginTop: 120 }} onClick={() => { setSelected(c); try { const params = new URLSearchParams(window.location.search); params.set('campaign', String(c.id)); window.history.replaceState({}, '', `/sweepstakes?${params.toString()}`); } catch {} }}>
                    <div style={{ position:'absolute', inset:0, background:'radial-gradient(circle at top right, rgba(251,191,36,.18), transparent 34%)', pointerEvents:'none' }} />
                    <div style={{ position:'relative' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                        <b style={{ fontSize: 22 }}>{c.title}</b>
                        <Countdown endsAt={c.endsAt} compact />
                      </div>
                      <div className="muted" style={{ marginTop:10, fontSize: 16 }}>{c.prizePoolLabel || 'Prize drawing'} • ${Number(c.prizeValueUsd || 0).toFixed(2)}</div>
                      <div className="muted" style={{ marginTop:8, fontSize: 15 }}>{c.allowTokenEntry ? `${c.tokenCost || 0} tokens to enter` : 'Token entry disabled'} {c.allowGoldenQuestion ? '• Golden entries enabled' : ''}</div>
                      <div className="muted" style={{ marginTop:8 }}>Ends: {c.endsAt ? new Date(c.endsAt).toLocaleString() : 'TBD'}</div>
                      <div style={{ display:'flex', gap:10, marginTop:14, flexWrap:'wrap' }}>
                        <span className="badge">{Number(c.totalEntries || 0)} entries</span>
                        <span className="badge">{Number(c.totalParticipants || 0)} participants</span>
                      </div>
                    </div>
                  </button>
                )) : <div className="featureCard"><b>No sweepstakes loaded yet.</b></div>}
              </div>
            </div>

            <div style={{ marginTop: 22 }}>
              <h3 style={{ marginBottom: 12, fontSize: 24 }}>Past drawings</h3>
              <div className="grid3">
                {past.length ? past.map((c) => (
                  <button key={c.id} id={`campaign-${c.id}`} type="button" className="featureCard" style={{ textAlign:'left', scrollMarginTop: 120 }} onClick={() => { setSelected(c); try { const params = new URLSearchParams(window.location.search); params.set('campaign', String(c.id)); window.history.replaceState({}, '', `/sweepstakes?${params.toString()}`); } catch {} }}>
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
      </div>
      <SweepstakesModal campaign={selected} user={data?.user} onClose={() => { setSelected(null); try { const params = new URLSearchParams(window.location.search); params.delete('campaign'); const next = params.toString(); window.history.replaceState({}, '', next ? `/sweepstakes?${next}` : '/sweepstakes'); } catch {} }} onEntered={() => { setSelected(null); load(); }} />
    </main>
  );
}
