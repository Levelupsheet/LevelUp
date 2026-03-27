
"use client";

import { useEffect, useMemo, useState } from "react";

type Row = { userId: string; displayName: string; xp?: number; level?: number; rank?: string; domain?: string; wins?: number };
type Payload = { weekly: Row[]; byDomain: Row[]; bossWins: Row[]; domain?: string | null; since?: string; resetRule?: string };

export default function LeaderboardPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [tab, setTab] = useState<"top" | "boss" | "domain">("top");

  useEffect(() => {
    fetch('/api/stage10/leaderboards?domain=AZURE', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('leaderboards')))
      .then(setData)
      .catch(() => setData({ weekly: [], byDomain: [], bossWins: [], domain: 'AZURE' }));
  }, []);

  const rows = useMemo(() => tab === 'top' ? (data?.weekly || []) : tab === 'boss' ? (data?.bossWins || []) : (data?.byDomain || []), [data, tab]);
  const subtitle = tab === 'top' ? 'Top candidates' : tab === 'boss' ? 'Boss Wins' : `${data?.domain || 'AZURE'} Domain`;

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 1100, paddingTop: 24, paddingBottom: 32 }}>
        <div className="card" style={{ padding: 18, borderColor: 'rgba(93,168,255,0.24)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img src="/levelup-pro-icon.png" alt="LevelUp Pro" style={{ width: 56, height: 56, borderRadius: 16, objectFit: 'cover' }} />
                <div>
                  <h1 style={{ margin: 0, fontSize: 28 }}>Leaderboard</h1>
                  <div><small>{subtitle}</small></div>
                </div>
              </div>
              <div style={{ marginTop: 10, opacity: 0.8 }}><small>{data?.resetRule || 'Weekly leaderboard uses XP earned from completed sessions over the last 7 days.'}</small></div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className={tab === 'top' ? 'pillTab active' : 'pillTab'} onClick={() => setTab('top')}>Top</button>
              <button className={tab === 'boss' ? 'pillTab active' : 'pillTab'} onClick={() => setTab('boss')}>Boss Wins</button>
              <button className={tab === 'domain' ? 'pillTab active' : 'pillTab'} onClick={() => setTab('domain')}>Domain</button>
              <a className="secondaryBtn" href="/dashboard">Back to dashboard</a>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gap: 12 }}>
            {rows.map((row, idx) => (
              <a key={`${tab}_${row.userId}_${idx}`} href={`/profile/${encodeURIComponent(row.userId)}`} className="featureCard" style={{ padding: 14, display: 'grid', gridTemplateColumns: '60px minmax(0,1fr) auto', gap: 12, alignItems: 'center', textDecoration: 'none' }}>
                <div className="badge" style={{ width: 44, textAlign: 'center', fontSize: 18 }}>{idx + 1}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 20, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.displayName}</div>
                  <div style={{ opacity: 0.8, marginTop: 4 }}><small>{tab === 'domain' ? `${row.domain || data?.domain || 'AZURE'} mastery` : row.rank || ''}{row.level ? ` • Lvl ${row.level}` : ''}</small></div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 900, fontSize: 22 }}>{tab === 'boss' ? `${Number(row.wins || 0)} wins` : `${Number(row.xp || 0)} XP`}</div>
                  <div style={{ opacity: 0.76 }}><small>Tap to view</small></div>
                </div>
              </a>
            ))}
            {!rows.length ? <div style={{ opacity: 0.8 }}><small>No leaderboard data yet.</small></div> : null}
          </div>
        </div>
      </div>
    </main>
  );
}
