"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function D2LifeOrb(props: {
  value: number; // 0..100
  name: string;
  size?: number; // px
}) {
  const { value, name, size = 150 } = props;
  const pct = useMemo(() => clamp(value, 0, 100), [value]);
  const fillY = 100 - pct; // 0..100

  // flash on damage
  const prev = useRef<number>(pct);
  const [flash, setFlash] = useState(false);
  const [shake, setShake] = useState(false);
  useEffect(() => {
    if (pct < prev.current) {
      setFlash(true);
      setShake(true);
      const t = setTimeout(() => setFlash(false), 160);
      const t2 = setTimeout(() => setShake(false), 240);
      return () => { clearTimeout(t); clearTimeout(t2); };
    }
    prev.current = pct;
  }, [pct]);

  const low = pct <= 25;

  return (
    <div className="d2OrbWrap" style={{ width: size }}>
      <div
        className={"d2OrbFrame" + (low ? " d2OrbLow d2OrbCracked" : "") + (shake ? " d2Hit" : "")}
        style={{ width: size, height: size }}
        aria-label="Player health orb"
      >
        {/* Decorative wing/metal */}
        <div className="d2OrbWing" aria-hidden />

        <div className="d2AssetBloodOrb" aria-hidden>
          <img src="/ui/blood-orb.webp" alt="" draggable={false} />
          <div className="d2AssetBloodDrain" style={{ height: `${100 - pct}%` }} />
        </div>

        <div className="d2OrbShine" aria-hidden />
        <div className={"d2OrbFlash" + (flash ? " on" : "")} aria-hidden />
      </div>

      <div className="d2NamePlate" aria-label="Player name">
        <div className="d2NamePlateInner">
          <span className="d2Roman">{name}</span>
          <span className="d2NameNums">
            {Math.max(0, Math.floor(pct))} / 100
          </span>
        </div>
      </div>
    </div>
  );
}
