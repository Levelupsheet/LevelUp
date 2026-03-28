
"use client";

import { useEffect, useMemo, useState } from "react";

type Payload = {
  summary?: { sessionCount: number; completedSessions: number; abandonedSessions: number; completionRate: number };
  weakDomains?: Array<{ domain: string; xp: number; userId: string }>;
  hardestQuestionTypes?: Array<{ type: string; attempts: number; accuracy: number }>;
};

type LearningRow = { domain: string; mastery: number; accuracy: number; currentDifficulty: number; correctCount: number; wrongCount: number };

type Stage12Profile = {
  analyzedAt?: string;
  targetRole?: string;
  skills?: string[];
  certifications?: string[];
  inferredDomains?: { domain: string; score: number }[];
  gaps?: string[];
  coaching?: {
    summary?: string;
    strengths?: string[];
    focusAreas?: string[];
    nextActions?: string[];
    behaviorNotes?: string[];
  };
};

type Stage12Status = {
  hasResume?: boolean;
  resumeFileName?: string | null;
  analyzedAt?: string | null;
  profile?: Stage12Profile | null;
};

function getActiveUserId() {
  if (typeof window === "undefined") return "";
  try {
    const explicit = localStorage.getItem("lu_active_user_id") || localStorage.getItem("activeUserId") || "";
    if (explicit) return explicit;
    const raw = localStorage.getItem("lu_users") || "[]";
    const users = JSON.parse(raw);
    if (Array.isArray(users) && users[0]?.id) return users[0].id;
  } catch {}
  return "";
}

export default function AdminInsightsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [learningRows, setLearningRows] = useState<LearningRow[]>([]);
  const [overallMastery, setOverallMastery] = useState<number>(0);
  const [userId, setUserId] = useState("");
  const [stage12Status, setStage12Status] = useState<Stage12Status | null>(null);
  const [stage12File, setStage12File] = useState<File | null>(null);
  const [stage12Uploading, setStage12Uploading] = useState(false);
  const [stage12Message, setStage12Message] = useState<string | null>(null);

  async function loadStage12(activeUserId: string) {
    if (!activeUserId) return;
    try {
      const res = await fetch(`/api/stage12/status?userId=${encodeURIComponent(activeUserId)}`, { cache: "no-store" });
      const payload = await res.json().catch(() => null);
      if (res.ok) setStage12Status(payload);
    } catch {}
  }

  async function analyzeResume() {
    if (!userId || !stage12File) return;
    setStage12Uploading(true);
    setStage12Message(null);
    try {
      const fd = new FormData();
      fd.append("userId", userId);
      fd.append("file", stage12File);
      const res = await fetch("/api/stage12/analyze", { method: "POST", body: fd });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.detail || payload?.error || "Resume analysis failed");
      setStage12Status({
        hasResume: true,
        resumeFileName: stage12File.name,
        analyzedAt: payload?.profile?.analyzedAt || new Date().toISOString(),
        profile: payload?.profile || null,
      });
      setStage12File(null);
      setStage12Message("Resume analyzed. AI Coach and learning insights were updated.");
    } catch (err: any) {
      setStage12Message(String(err?.message || err || "Resume analysis failed"));
    } finally {
      setStage12Uploading(false);
    }
  }

  useEffect(() => {
    const activeUserId = getActiveUserId();
    setUserId(activeUserId);

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

    loadStage12(activeUserId);
  }, []);

  const stage12 = stage12Status?.profile || null;
  const focusAreas = (stage12?.coaching?.focusAreas || stage12?.gaps || []).slice(0, 4);
  const nextActions = (stage12?.coaching?.nextActions || []).slice(0, 4);
  const skills = (stage12?.skills || []).slice(0, 16);

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 1180, paddingTop: 24, paddingBottom: 32 }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ margin: 0 }}>Insights & AI Coach</h1>
              <div style={{ marginTop: 6, opacity: 0.82 }}><small>Performance signals, adaptive learning profile, and resume-driven coaching in one place.</small></div>
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
              {!(data?.hardestQuestionTypes || []).length ? <small style={{ opacity: 0.78 }}>No question performance data yet.</small> : null}
            </div>
          </div>

          <div className="card" style={{ padding: 18, borderColor: 'rgba(100,220,255,0.22)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ marginTop: 0, marginBottom: 0 }}>AI Coach</h3>
                <div style={{ marginTop: 6, opacity: 0.82 }}><small>Upload or refresh your resume analysis here. The original file is not retained long term.</small></div>
              </div>
            </div>

            <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <label className="secondaryBtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <span>{stage12File ? stage12File.name : (stage12Status?.resumeFileName || "Choose resume")}</span>
                <input type="file" accept=".pdf,.docx" onChange={(e) => setStage12File(e.target.files?.[0] || null)} style={{ display: 'none' }} />
              </label>
              <button className="primaryBtn" type="button" disabled={!stage12File || stage12Uploading || !userId} onClick={analyzeResume}>
                {stage12Uploading ? "Analyzing..." : "Upload + analyze"}
              </button>
              {stage12Status?.analyzedAt ? <span className="badge">Last analyzed {new Date(stage12Status.analyzedAt).toLocaleDateString()}</span> : null}
            </div>

            {stage12Message ? <div style={{ marginTop: 10, opacity: 0.86 }}><small>{stage12Message}</small></div> : null}

            <div style={{ marginTop: 14, fontWeight: 900, fontSize: 24 }}>{stage12?.targetRole || "No analysis yet"}</div>
            <div style={{ marginTop: 8, opacity: 0.86 }}>
              <small>{stage12?.coaching?.summary || "Upload and analyze a resume to unlock your coaching summary, focus areas, and next actions."}</small>
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(stage12?.inferredDomains || []).slice(0, 5).map((row) => (
                <span key={row.domain} className="badge">{row.domain} · {row.score}</span>
              ))}
            </div>

            <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
              <div className="featureCard" style={{ padding: 12 }}>
                <div style={{ fontWeight: 800 }}>Focus areas</div>
                <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                  {focusAreas.map((row, idx) => <div key={`focus_${idx}`}><small>• {row}</small></div>)}
                  {!focusAreas.length ? <small style={{ opacity: 0.78 }}>No focus areas yet.</small> : null}
                </div>
              </div>
              <div className="featureCard" style={{ padding: 12 }}>
                <div style={{ fontWeight: 800 }}>Coach next actions</div>
                <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                  {nextActions.map((row, idx) => <div key={`next_${idx}`}><small>• {row}</small></div>)}
                  {!nextActions.length ? <small style={{ opacity: 0.78 }}>No recommendations yet.</small> : null}
                </div>
                {skills.length ? (
                  <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {skills.map((skill) => <span key={skill} className="badge">{skill}</span>)}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
