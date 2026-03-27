
"use client";

import { useEffect, useState } from "react";

type Row = { userId: string; displayName: string; xp?: number; level?: number; rank?: string };

export default function PvpPage() {
  const [leaders, setLeaders] = useState<Row[]>([]);
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    fetch('/api/leaderboard/top?metric=top', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('pvp')))
      .then((data) => setLeaders(Array.isArray(data?.top) ? data.top : []))
      .catch(() => setLeaders([]));
  }, []);

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 1080, paddingTop: 24, paddingBottom: 32 }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0 }}>PvP Arena</h1>
              <div style={{ marginTop: 6, opacity: 0.82 }}><small>Async-first PvP: challenge another player on the same seeded question set and compare accuracy, speed, and streaks.</small></div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a className="secondaryBtn" href="/leaderboard">Leaderboard</a>
              <a className="secondaryBtn" href="/dashboard">Dashboard</a>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 16, marginTop: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ marginTop: 0 }}>Choose a rival</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              {leaders.map((row, idx) => (
                <button key={row.userId} className="featureCard" type="button" onClick={() => setSelected(row.userId)} style={{ padding: 12, display: 'flex', justifyContent: 'space-between', gap: 12, textAlign: 'left', borderColor: selected === row.userId ? 'rgba(255,214,102,0.55)' : undefined }}>
                  <div><b>{idx + 1}. {row.displayName}</b><div style={{ opacity: 0.76, marginTop: 4 }}><small>{row.rank} • Lvl {row.level}</small></div></div>
                  <div style={{ fontWeight: 800 }}>{row.xp} XP</div>
                </button>
              ))}
            </div>
          </div>
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ marginTop: 0 }}>Challenge flow</h3>
            <div className="featureCard" style={{ padding: 14 }}>
              <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
                <li>Create a challenge.</li>
                <li>Both players get the same seeded question set.</li>
                <li>Winner is decided by accuracy first, then time, then streak.</li>
              </ol>
            </div>
            <button className="primaryBtn" type="button" style={{ marginTop: 14 }} disabled={!selected} title={!selected ? 'Choose a rival first' : undefined}>Create async PvP challenge</button>
            <div style={{ marginTop: 10, opacity: 0.78 }}><small>Live synchronous face-off can be added later. This page is the Stage 10 async PvP launch surface.</small></div>
          </div>
        </div>
      </div>
    </main>
  );
}
