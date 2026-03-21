"use client";

import { domainLabel } from "@/lib/learningProfile";

const DOMAIN_COLORS: Record<string, { fill: string; soft: string; badge: string }> = {
  AWS: { fill: 'linear-gradient(90deg,#60a5fa,#3b82f6)', soft: 'rgba(59,130,246,.18)', badge: '#93c5fd' },
  AZURE: { fill: 'linear-gradient(90deg,#22d3ee,#06b6d4)', soft: 'rgba(6,182,212,.18)', badge: '#67e8f9' },
  NETWORKING: { fill: 'linear-gradient(90deg,#34d399,#22c55e)', soft: 'rgba(34,197,94,.18)', badge: '#86efac' },
  SECURITY: { fill: 'linear-gradient(90deg,#f59e0b,#eab308)', soft: 'rgba(234,179,8,.18)', badge: '#fde68a' },
  IDENTITY: { fill: 'linear-gradient(90deg,#a78bfa,#8b5cf6)', soft: 'rgba(139,92,246,.18)', badge: '#c4b5fd' },
  WINDOWS: { fill: 'linear-gradient(90deg,#fb7185,#f43f5e)', soft: 'rgba(244,63,94,.18)', badge: '#fda4af' },
};

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

function masteryTone(domain: string, mastery: number) {
  const v = clamp(mastery);
  const domainTone = DOMAIN_COLORS[String(domain || '').toUpperCase()] || { fill: 'linear-gradient(90deg,#64748b,#94a3b8)', soft: 'rgba(148,163,184,.14)', badge: '#cbd5e1' };
  if (v <= 0) return { color: '#94a3b8', track: 'rgba(148,163,184,.14)', bg: 'linear-gradient(90deg,#64748b,#94a3b8)', badge: '#94a3b8' };
  return { color: domainTone.badge, track: domainTone.soft, bg: domainTone.fill, badge: domainTone.badge };
}

export default function AdaptiveLearningCard(props: {
  overallMastery?: number;
  rows?: DomainRow[];
  weakestDomains?: string[];
}) {
  const rows = Array.isArray(props.rows) ? props.rows.slice(0, 6) : [];
  return (
    <div className="card adaptiveLearningCard" style={{ padding: 11, marginBottom: 12, transform: 'scale(0.92)', transformOrigin: 'top center' }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 15 }}>Adaptive Learning Profile</div>
          <div className="muted" style={{ marginTop: 4 }}>Mastery rises over many correct answers, accuracy, and difficulty.</div>
        </div>
        <div className="badge">Overall mastery {Math.round(Number(props.overallMastery ?? 0))}%</div>
      </div>
      <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
        {rows.length ? rows.map((row) => {
          const mastery = clamp(row.mastery);
          const accuracy = clamp(row.accuracy);
          const totalAnswered = Math.max(0, Number(row.correctCount || 0) + Number(row.wrongCount || 0));
          const tone = masteryTone(row.domain, mastery);
          const hasAnswers = totalAnswered > 0;
          return (
            <div key={row.domain} style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: 9, background: 'rgba(255,255,255,.02)' }}>
              <div style={{ display:'grid', gridTemplateColumns:'minmax(110px,160px) 1fr auto', gap:12, alignItems:'center' }} className="adaptiveGrid">
                <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{domainLabel(row.domain)}</div>
                  <span style={{ fontSize:12, color:tone.badge, border:`1px solid ${tone.track}`, background:tone.track, borderRadius:999, padding:'2px 8px', fontWeight:700 }}>{mastery.toFixed(1)}% mastery</span>
                </div>
                <div style={{ height: 16, borderRadius: 999, background:'rgba(255,255,255,.08)', overflow:'hidden', position:'relative', boxShadow: mastery > 0 ? `inset 0 0 0 1px ${tone.track}` : undefined }}>
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
