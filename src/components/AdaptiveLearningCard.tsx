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

export default function AdaptiveLearningCard(props: {
  overallMastery?: number;
  rows?: DomainRow[];
  weakestDomains?: string[];
}) {
  const rows = Array.isArray(props.rows) ? props.rows.slice(0, 6) : [];
  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Adaptive Learning Profile</div>
          <div className="muted" style={{ marginTop: 4 }}>Mastery rises on correct answers, falls on missed answers, and question difficulty adapts by domain.</div>
        </div>
        <div className="badge">Overall mastery {Math.round(Number(props.overallMastery ?? 50))}%</div>
      </div>
      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        {rows.length ? rows.map((row) => (
          <div key={row.domain} className="learningRow">
            <div className="learningRowLabel" style={{ fontWeight: 800 }}>{domainLabel(row.domain)}</div>
            <div className="learningRowTrack">
              <div className="learningRowFill" style={{ width: `${Math.max(0, Math.min(100, row.mastery))}%` }} />
            </div>
            <div className="learningRowValue" style={{ fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{Math.round(row.mastery)}%</div>
            <div className="learningRowMeta muted" style={{ fontSize: 12 }}>Acc {Math.round(row.accuracy)}% · D{row.currentDifficulty}</div>
          </div>
        )) : <div className="muted">Complete a run to start building your adaptive learning profile.</div>}
      </div>
      {props.weakestDomains?.length ? (
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 12 }}>Weakest domains:</span>
          {props.weakestDomains.map((domain) => <span key={domain} className="badge">{domainLabel(domain)}</span>)}
        </div>
      ) : null}
    </div>
  );
}
