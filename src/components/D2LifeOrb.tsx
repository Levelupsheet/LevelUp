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

        <svg viewBox="0 0 100 100" className="d2OrbSvg" aria-hidden>
          <defs>
            <radialGradient id="d2blood" cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#ff7a7a" stopOpacity="0.95" />
              <stop offset="35%" stopColor="#c10e0e" stopOpacity="0.98" />
              <stop offset="70%" stopColor="#5c0000" stopOpacity="0.98" />
              <stop offset="100%" stopColor="#1a0000" stopOpacity="1" />
            </radialGradient>

            <radialGradient id="d2vignette" cx="50%" cy="50%" r="62%">
              <stop offset="55%" stopColor="#000" stopOpacity="0" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.7" />
            </radialGradient>

            <linearGradient id="d2glass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.28" />
              <stop offset="55%" stopColor="#fff" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </linearGradient>

            <clipPath id="d2orb">
              <circle cx="50" cy="50" r="48" />
            </clipPath>

            <clipPath id="d2fill">
              <rect x="0" y={fillY} width="100" height="100" />
            </clipPath>

            <filter id="d2swirl">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.028"
                numOctaves="2"
                seed="9"
              >
                <animate
                  attributeName="baseFrequency"
                  dur="6s"
                  values="0.024;0.032;0.024"
                  repeatCount="indefinite"
                />
              </feTurbulence>
              <feDisplacementMap in="SourceGraphic" scale="9" />
            </filter>
          </defs>

          <g clipPath="url(#d2orb)">
            <circle cx="50" cy="50" r="48" fill="#120000" />

            <g clipPath="url(#d2fill)">
              <circle cx="50" cy="50" r="48" fill="url(#d2blood)" />
              <g filter="url(#d2swirl)" opacity="0.35">
                <circle cx="48" cy="52" r="52" fill="url(#d2blood)" />
              </g>
            </g>

            <ellipse
              cx="50"
              cy={fillY}
              rx="46"
              ry="5.5"
              fill="#000"
              opacity={pct > 2 ? 0.22 : 0}
            />

            <circle cx="50" cy="50" r="48" fill="url(#d2vignette)" />

            <circle cx="50" cy="50" r="48" fill="url(#d2glass)" opacity="0.75" />

            <path
              d="M18,32 C28,14 52,10 70,18 C78,22 83,28 86,36"
              fill="none"
              stroke="#fff"
              strokeOpacity="0.24"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              d="M22,40 C30,24 50,18 66,24"
              fill="none"
              stroke="#fff"
              strokeOpacity="0.13"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </g>
        </svg>

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
