
"use client";

import { useEffect, useState } from "react";

type Payload = {
  summary?: { sessionCount: number; completedSessions: number; abandonedSessions: number; completionRate: number };
  weakDomains?: Array<{ domain: string; xp: number; userId: string }>;
  hardestQuestionTypes?: Array<{ type: string; attempts: number; accuracy: number }>;
  quitPoints?: Array<{ question: number; count: number }>;
  calibrationSummary?: Array<{ questionId: string; observedAccuracy: number; avgResponseMs: number; difficultyDrift: number }>;
};
type LearningRow = { domain: string; mastery: number; accuracy: number; currentDifficulty: number; correctCount: number; wrongCount: number };

export default function AdminInsightsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [learningRows, setLearningRows] = useState<LearningRow[]>([]);
  const [overallMastery, setOverallMastery] = useState<number>(0);

  useEffect(() => {
    fetch('/api/stage11/overview', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('overview')))
      .then(setData)
      .catch(() => setData({}));

    fetch('/api/learning/profile', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('learning')))
      .then((payload) => {
        const rows = Array.isArray(payload?.profile?.masteryByDomain) ? payload.profile.masteryByDomain : [];
        setLearningRows(rows);
        const overall = Number(payload?.profile?.overallMastery ?? (rows.length ? rows.reduce((sum: number, row: any) => sum + Number(row?.mastery || 0), 0) / rows.length : 0));
        setOverallMastery(Number.isFinite(overall) ? overall : 0);
      })
      .catch(() => {
        setLearningRows([]);
        setOverallMastery(0);
      });
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
                          </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, marginTop: 16 }}>
          <div className="featureCard" style={{ padding: 14 }}><small>Sessions</small><div style={{ fontWeight: 900, fontSize: 24 }}>{data?.summary?.sessionCount || 0}</div></div>
          <div className="featureCard" style={{ padding: 14 }}><small>Completed</small><div style={{ fontWeight: 900, fontSize: 24 }}>{data?.summary?.completedSessions || 0}</div></div>
          <div className="featureCard" style={{ padding: 14 }}><small>Abandoned</small><div style={{ fontWeight: 900, fontSize: 24 }}>{data?.summary?.abandonedSessions || 0}</div></div>
          <div className="featureCard" style={{ padding: 14 }}><small>Completion rate</small><div style={{ fontWeight: 900, fontSize: 24 }}>{data?.summary?.completionRate || 0}%</div></div>
        </div>


        <div style={{ display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: 16, marginTop: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <h3 style={{ marginTop: 0, marginBottom: 0 }}>Adaptive learning profile</h3>
              <span className="badge">{overallMastery.toFixed(1)}% overall mastery</span>
            </div>
            <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
              {learningRows.slice(0, 8).map((row) => (
                <div key={row.domain} className="featureCard" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                    <b>{row.domain}</b>
                    <small>{Number(row.mastery || 0).toFixed(1)}% • D{Number(row.currentDifficulty || 1)}</small>
                  </div>
                  <div style={{ height: 10, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(0, Math.min(100, Number(row.mastery || 0)))}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, rgba(255,206,120,0.92), rgba(97,204,255,0.88))' }} />
                  </div>
                  <div style={{ marginTop: 8, opacity: 0.78, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <small>Accuracy {Number(row.accuracy || 0).toFixed(1)}%</small>
                    <small>{Number(row.correctCount || 0)} correct / {Number(row.wrongCount || 0)} missed</small>
                  </div>
                </div>
              ))}
              {!learningRows.length ? <small style={{ opacity: 0.78 }}>No adaptive profile data yet.</small> : null}
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ marginTop: 0 }}>Mastery chart</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              {learningRows.slice(0, 6).map((row) => (
                <div key={`chart_${row.domain}`} style={{ display: 'grid', gridTemplateColumns: '110px minmax(0,1fr) 64px', gap: 10, alignItems: 'center' }}>
                  <small style={{ opacity: 0.82 }}>{row.domain}</small>
                  <div style={{ height: 12, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(0, Math.min(100, Number(row.mastery || 0)))}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, rgba(255,206,120,0.92), rgba(97,204,255,0.88))' }} />
                  </div>
                  <b style={{ textAlign: 'right' }}>{Number(row.mastery || 0).toFixed(0)}%</b>
                </div>
              ))}
              {!learningRows.length ? <small style={{ opacity: 0.78 }}>Chart appears after answered sessions build your adaptive profile.</small> : null}
            </div>
          </div>
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
