"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function D2EnemyHealthBar(props: {
  name?: string;
  value: number; // 0..max
  max?: number; // default 100
}) {
  const { name = "Lagger", value, max = 100 } = props;
  const pct = useMemo(() => clamp((value / Math.max(1, max)) * 100, 0, 100), [value, max]);

  const prev = useRef<number>(pct);
  const [flash, setFlash] = useState(false);
  const [hit, setHit] = useState(false);
  useEffect(() => {
    if (pct < prev.current) {
      setFlash(true);
      setHit(true);
      const t = setTimeout(() => setFlash(false), 180);
      const t2 = setTimeout(() => setHit(false), 260);
      return () => { clearTimeout(t); clearTimeout(t2); };
    }
    prev.current = pct;
  }, [pct]);

  const low = pct <= 25;

  return (
    <div className={"d2EnemyCard" + (low ? " low" : "") + (hit ? " d2Hit" : "")}>
      <div className="d2EnemyTop">
        <div className="d2EnemyName d2Roman">{name}</div>
        <div className="d2EnemyNums">
          {Math.max(0, Math.floor(value))} / {Math.max(1, Math.floor(max))} • {pct.toFixed(0)}%
        </div>
      </div>

      <div className="d2EnemyBarFrame" aria-label="Enemy health bar">
        <div className="d2EnemySkull left" aria-hidden />
        <div className="d2EnemySkull right" aria-hidden />

        <div className="d2EnemyBarInner">
          <div className="d2EnemyFill" style={{ width: `${pct}%` }} />
          <div className="d2EnemyShine" aria-hidden />
          <div className={"d2EnemyFlash" + (flash ? " on" : "")} aria-hidden />
        </div>
      </div>

      <div className="d2EnemyHint">
        Right answers damage the enemy • Wrong answers damage you
      </div>
    </div>
  );
}
