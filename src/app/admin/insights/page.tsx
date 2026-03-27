
"use client";

import { useEffect, useState } from "react";

type Payload = {
  summary?: { sessionCount: number; completedSessions: number; abandonedSessions: number; completionRate: number };
  weakDomains?: Array<{ domain: string; xp: number; userId: string }>;
  hardestQuestionTypes?: Array<{ type: string; attempts: number; accuracy: number }>;
  quitPoints?: Array<{ question: number; count: number }>;
  calibrationSummary?: Array<{ questionId: string; observedAccuracy: number; avgResponseMs: number; difficultyDrift: number }>;
};

export default function AdminInsightsPage() {
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    fetch('/api/stage11/overview', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('overview')))
      .then(setData)
      .catch(() => setData({}));
  }, []);

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 1180, paddingTop: 24, paddingBottom: 32 }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ margin: 0 }}>Stage 11 insights dashboard</h1>
              <div style={{ marginTop: 6, opacity: 0.82 }}><small>Question performance, quit points, and difficulty calibration from live user data.</small></div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a className="secondaryBtn" href="/dashboard">Dashboard</a>
              <a className="secondaryBtn" href="/admin">Admin</a>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, marginTop: 16 }}>
          <div className="featureCard" style={{ padding: 14 }}><small>Sessions</small><div style={{ fontWeight: 900, fontSize: 24 }}>{data?.summary?.sessionCount || 0}</div></div>
          <div className="featureCard" style={{ padding: 14 }}><small>Completed</small><div style={{ fontWeight: 900, fontSize: 24 }}>{data?.summary?.completedSessions || 0}</div></div>
          <div className="featureCard" style={{ padding: 14 }}><small>Abandoned</small><div style={{ fontWeight: 900, fontSize: 24 }}>{data?.summary?.abandonedSessions || 0}</div></div>
          <div className="featureCard" style={{ padding: 14 }}><small>Completion rate</small><div style={{ fontWeight: 900, fontSize: 24 }}>{data?.summary?.completionRate || 0}%</div></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ marginTop: 0 }}>Hardest question types</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              {(data?.hardestQuestionTypes || []).slice(0,8).map((row) => (
                <div key={row.type} className="featureCard" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>{row.type}</span><b>{row.accuracy}% accuracy</b></div>
              ))}
            </div>
          </div>
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ marginTop: 0 }}>Quit points</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              {(data?.quitPoints || []).slice(0,8).map((row) => (
                <div key={row.question} className="featureCard" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>Question {row.question}</span><b>{row.count} quits</b></div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ marginTop: 0 }}>Weak domains</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              {(data?.weakDomains || []).slice(0,8).map((row, idx) => (
                <div key={`${row.userId}_${row.domain}_${idx}`} className="featureCard" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>{row.domain}</span><b>{row.xp} XP</b></div>
              ))}
            </div>
          </div>
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ marginTop: 0 }}>Difficulty calibration</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              {(data?.calibrationSummary || []).slice(0,8).map((row) => (
                <div key={row.questionId} className="featureCard" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>{row.questionId.slice(0, 10)}…</span><b>{row.observedAccuracy}%</b></div>
                  <div style={{ opacity: 0.76, marginTop: 4 }}><small>Avg {Math.round(row.avgResponseMs || 0)}ms • drift {row.difficultyDrift}</small></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
