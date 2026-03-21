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
  if (v >= 80) return { color: "#eab308", track: "rgba(234,179,8,.18)", bg: "linear-gradient(90deg,#f59e0b,#eab308)" };
  if (v >= 55) return { color: "#22c55e", track: "rgba(34,197,94,.16)", bg: "linear-gradient(90deg,#34d399,#22c55e)" };
  if (v >= 30) return { color: "#38bdf8", track: "rgba(56,189,248,.16)", bg: "linear-gradient(90deg,#38bdf8,#6366f1)" };
  return { color: "#94a3b8", track: "rgba(148,163,184,.14)", bg: "linear-gradient(90deg,#64748b,#94a3b8)" };
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
          <div className="muted" style={{ marginTop: 4 }}>Mastery rises over many correct answers, accuracy, and difficulty.</div>
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
            <div key={row.domain} style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: 12, background: 'rgba(255,255,255,.02)' }}>
              <div style={{ display:'grid', gridTemplateColumns:'minmax(110px,160px) 1fr auto', gap:12, alignItems:'center' }} className="adaptiveGrid">
                <div style={{ fontWeight: 800, fontSize: 15 }}>{domainLabel(row.domain)}</div>
                <div style={{ height: 16, borderRadius: 999, background:'rgba(255,255,255,.08)', overflow:'hidden', position:'relative' }}>
                  <div style={{ width: `${mastery}%`, height:'100%', background: tone.bg, borderRadius: 999 }} />
                </div>
                <div style={{ fontWeight: 800, color: tone.color, minWidth: 52, textAlign: 'right' }}>{mastery}%</div>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', color:'rgba(255,255,255,.74)', fontSize:12, marginTop:8 }}>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <span style={{ color: 'rgba(255,255,255,.92)', fontWeight: 700 }}>{row.correctCount} correct</span>
                  <span>•</span>
                  <span>{row.wrongCount} missed</span>
                  <span>•</span>
                  <span>{accuracy}% accuracy</span>
                  <span>•</span>
                  <span>D{row.currentDifficulty}</span>
                </div>
                <div>{hasAnswers ? `${totalAnswered} answered` : 'Keep practicing to build this domain.'}</div>
              </div>
            </div>
          );
        }) : <div className="muted">Complete a run to start building your adaptive learning profile.</div>}
      </div>
    </div>
  );
}
