"use client";

import React, { useMemo } from "react";

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

  return (
    <div className="d2EnemyCard" aria-label={`Enemy health ${Math.round(pct)} percent`}>
      <img
        className="d2EnemyEnergyOrb"
        src="/ui/grimdark/flow_energy_ball_001.png"
        alt=""
        aria-hidden="true"
      />
      <div className="d2EnemyOrbValue">
        {Math.max(0, Math.floor(value))} / {Math.max(1, Math.floor(max))}<br />
        {pct.toFixed(0)}%
      </div>
      {name ? <div className="d2EnemyName d2Roman">{name}</div> : null}
    </div>
  );
}
