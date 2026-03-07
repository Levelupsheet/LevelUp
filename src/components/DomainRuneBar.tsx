"use client";

import React, { useMemo } from "react";

export default function DomainRuneBar(props: {
  domainLabel: string;
  mastery: number; // 0..100
  tier: 1 | 2 | 3;
}) {
  const { domainLabel, mastery, tier } = props;

  const segments = 10;
  const filled = useMemo(() => {
    const pct = Math.max(0, Math.min(100, mastery));
    return Math.round((pct / 100) * segments);
  }, [mastery]);

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <div className="d2Roman" style={{ fontSize: 12, letterSpacing: 1.2, opacity: 0.85, textTransform: "uppercase" }}>
          Domain Mastery: {domainLabel}
        </div>
        <div style={{ fontSize: 12, opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>
          Lv{tier} • {Math.round(mastery)}%
        </div>
      </div>

      <div className="d2RuneBar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(mastery)}>
        {Array.from({ length: segments }).map((_, i) => {
          const on = i < filled;
          return <span key={i} className={"d2Rune " + (on ? "on" : "")} />;
        })}
      </div>
    </div>
  );
}
