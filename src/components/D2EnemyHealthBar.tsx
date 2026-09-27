"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function D2EnemyHealthBar(props: {
  name?: string;
  value: number;
  max?: number;
}) {
  const { name = "", value, max = 100 } = props;
  const pct = useMemo(() => clamp((value / Math.max(1, max)) * 100, 0, 100), [value, max]);
  const prev = useRef(pct);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (pct < prev.current) {
      setFlash(true);
      const timer = window.setTimeout(() => setFlash(false), 180);
      prev.current = pct;
      return () => window.clearTimeout(timer);
    }
    prev.current = pct;
  }, [pct]);

  return (
    <div className={"d2EnemyCard" + (pct <= 25 ? " low" : "")} aria-label={`Enemy health ${Math.round(pct)} percent`}>
      <div className="d2EnemyEnergyOrbShell" aria-hidden="true">
        <img className="d2EnemyEnergyOrb" src="/ui/grimdark/flow_energy_ball_001.png" alt="" draggable={false} />
        <div className="d2EnemyEnergyDrain" style={{ height: `${100 - pct}%` }} />
        <div className={"d2EnemyEnergyFlash" + (flash ? " on" : "")} />
      </div>
      <div className="d2EnemyOrbValue">
        {Math.max(0, Math.floor(value))} / {Math.max(1, Math.floor(max))}<br />
        {pct.toFixed(0)}%
      </div>
      {name ? <div className="d2EnemyName d2Roman">{name}</div> : null}
    </div>
  );
}
