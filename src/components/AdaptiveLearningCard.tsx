"use client";

import { domainLabel } from "@/lib/learningProfile";

type DomainRow = {
  domain: string;
  mastery: number;
  accuracy: number;
  currentDifficulty: number;
  correctCount: number;
  wrongCount: number;
};

function clamp(v: number) {
  return Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));
}

function masteryTone(mastery: number) {
  const v = clamp(mastery);
  if (v >= 80) return { color: "#eab308", bg: "linear-gradient(90deg, rgba(245,158,11,0.95), rgba(234,179,8,0.95))" };
  if (v >= 55) return { color: "#22c55e", bg: "linear-gradient(90deg, rgba(34,197,94,0.95), rgba(16,185,129,0.95))" };
  if (v >= 30) return { color: "#38bdf8", bg: "linear-gradient(90deg, rgba(56,189,248,0.95), rgba(99,102,241,0.92))" };
  return { color: "#94a3b8", bg: "linear-gradient(90deg, rgba(148,163,184,0.9), rgba(100,116,139,0.92))" };
}

export default function AdaptiveLearningCard(props: {
  overallMastery?: number;
  rows?: DomainRow[];
  weakestDomains?: string[];
}) {
  const rows = Array.isArray(props.rows) ? props.rows.slice(0, 6) : [];
  return (
    <div className="card adaptiveLearningCard" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Adaptive Learning Profile</div>
          <div className="muted" style={{ marginTop: 4 }}>Mastery grows over many correct answers and adapts by domain, accuracy, and difficulty.</div>
        </div>
        <div className="badge">Overall mastery {Math.round(Number(props.overallMastery ?? 0))}%</div>
      </div>
      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {rows.length ? rows.map((row) => {
          const mastery = clamp(row.mastery);
          const accuracy = clamp(row.accuracy);
          const totalAnswered = Math.max(0, Number(row.correctCount || 0) + Number(row.wrongCount || 0));
          const tone = masteryTone(mastery);
          const hasAnswers = totalAnswered > 0;
          return (
            <div key={row.domain} className="adaptiveRow" style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: 12, background: 'rgba(255,255,255,.02)' }}>
              <div className="adaptiveRowTop" style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div className="adaptiveDomainLabel" style={{ fontWeight: 800, fontSize: 15 }}>{domainLabel(row.domain)}</div>
                  <span className="adaptiveMiniBadge" style={{ border: `1px solid ${tone.color}55`, color: tone.color, borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 }}>
                    {mastery}% mastery
                  </span>
                </div>
                <div className="adaptiveMetaRight" style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', color:'rgba(255,255,255,.72)', fontSize:12 }}>
                  <span>{hasAnswers ? `${row.correctCount} correct` : 'No graded answers yet'}</span>
                  <span>•</span>
                  <span>{accuracy}% accuracy</span>
                  <span>•</span>
                  <span>D{row.currentDifficulty}</span>
                </div>
              </div>
              <div className="adaptiveTrack" style={{ height: 14, borderRadius: 999, background:'rgba(255,255,255,.08)', overflow:'hidden', marginTop:10 }}>
                <div className="adaptiveFill" style={{ width: `${mastery}%`, height:'100%', background: tone.bg, borderRadius: 999 }} />
              </div>
              <div className="adaptiveRowBottom" style={{ display:'flex', justifyContent:'space-between', gap:10, flexWrap:'wrap', color:'rgba(255,255,255,.72)', fontSize:12, marginTop:8 }}>
                <div className="adaptiveCounts">{hasAnswers ? `${row.correctCount} / ${totalAnswered} answered correctly` : 'Keep practicing to build measured accuracy.'}</div>
                <div className="adaptiveCounts">{row.wrongCount} missed</div>
              </div>
            </div>
          );
        }) : <div className="muted">Complete a run to start building your adaptive learning profile.</div>}
      </div>
      {props.weakestDomains?.length ? (
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 12 }}>Needs work:</span>
          {props.weakestDomains.map((domain) => <span key={domain} className="badge">{domainLabel(domain)}</span>)}
        </div>
      ) : null}
    </div>
  );
}
