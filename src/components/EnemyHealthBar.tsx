"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  name?: string;     // e.g. "Lagger"
  value: number;     // 0..100 or current hp
  max?: number;      // defaults 100
  className?: string;
};

/**
 * Enemy HP bar with a more "hostile" look.
 * - Red molten gradient fill + gloss
 * - Damage flash when value drops
 */
export default function EnemyHealthBar({ name = "Lagger", value, max = 100, className = "" }: Props) {
  const clamped = Math.max(0, Math.min(max, value));
  const pct = useMemo(() => (max <= 0 ? 0 : clamped / max), [clamped, max]);

  const prev = useRef<number>(clamped);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (clamped < prev.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 160);
      return () => clearTimeout(t);
    }
    prev.current = clamped;
  }, [clamped]);

  const critical = pct <= 0.25;

  return (
    <div className={className}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: ".2px" }}>{name}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.60)", fontVariantNumeric: "tabular-nums" }}>
          {Math.round(clamped)} / {Math.round(max)} • {(pct * 100).toFixed(0)}%
        </div>
      </div>

      <div
        style={{
          marginTop: 10,
          position: "relative",
          height: 18,
          borderRadius: 10,
          overflow: "hidden",
          background: "rgba(255,255,255,.06)",
          border: "1px solid rgba(255,255,255,.14)",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,.35), 0 14px 35px rgba(0,0,0,.45)",
        }}
      >
        {/* skull-ish edge accents */}
        <div
          style={{
            position: "absolute",
            inset: -1,
            borderRadius: 10,
            boxShadow: "inset 0 0 0 1px rgba(255,80,80,.10)",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${pct * 100}%`,
            transition: "width 450ms cubic-bezier(.2,.9,.2,1)",
            background:
              "linear-gradient(90deg, rgba(255,70,70,.95), rgba(220,38,38,.95) 35%, rgba(127,29,29,.95))",
            boxShadow: "0 0 16px rgba(255,60,60,.22)",
            filter: critical ? "drop-shadow(0 0 10px rgba(255,70,70,.35))" : undefined,
          }}
        >
          {/* glossy top */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,0) 55%)",
              opacity: 0.75,
              pointerEvents: "none",
            }}
          />

          {/* moving ember shine */}
          <div className="lu_enemy_shine" style={{
            position: "absolute",
            top: -16,
            bottom: -16,
            left: "-35%",
            width: "35%",
            transform: "rotate(14deg)",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent)",
            opacity: 0.65,
            pointerEvents: "none",
          }} />
        </div>

        {/* damage flash */}
        <div
          style={{
            pointerEvents: "none",
            position: "absolute",
            inset: 0,
            background: "rgba(255,255,255,.14)",
            opacity: flash ? 1 : 0,
            transition: "opacity 150ms ease",
            mixBlendMode: "screen",
          }}
        />
      </div>

      <style jsx global>{`
        @keyframes lu_enemyShine {
          0% { transform: translateX(-140%) rotate(14deg); opacity: 0; }
          15% { opacity: .8; }
          60% { opacity: .4; }
          100% { transform: translateX(420%) rotate(14deg); opacity: 0; }
        }
        .lu_enemy_shine { animation: lu_enemyShine 2.2s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
