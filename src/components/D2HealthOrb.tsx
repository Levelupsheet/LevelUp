"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  value: number;
  max: number;
  size?: number; // px
  label?: string; // defaults to "Life"
  showNumbers?: boolean;
  className?: string;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

/**
 * Diablo-2-inspired life orb (no images).
 * - Fill rises from bottom based on value/max
 * - Subtle swirl + glass highlight
 * - Damage flash when value drops
 */
export default function D2HealthOrb({
  value,
  max,
  size = 120,
  label = "Life",
  showNumbers = true,
  className = "",
}: Props) {
  const pct = useMemo(() => {
    const m = Math.max(1, max);
    return clamp(value / m, 0, 1);
  }, [value, max]);

  const prev = useRef<number>(value);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (value < prev.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 180);
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);

  const low = pct <= 0.25;
  const fillY = 1 - pct;

  // stable id for SVG defs
  const id = useMemo(() => Math.random().toString(36).slice(2), []);

  return (
    <div className={`inline-flex flex-col items-center gap-2 ${className}`}>
      <div
        className="relative select-none"
        style={{
          width: size,
          height: size,
          transform: low ? "scale(1.01)" : undefined,
          filter: low ? "drop-shadow(0 0 14px rgba(255,60,60,.22))" : "drop-shadow(0 12px 28px rgba(0,0,0,.45))",
          animation: low ? "lu_d2pulse 1.2s ease-in-out infinite" : undefined,
        }}
      >
        {/* Outer ring */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "999px",
            background:
              "linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,.06) 30%, rgba(0,0,0,.55))",
            boxShadow: "0 22px 55px rgba(0,0,0,.65)",
            border: "1px solid rgba(255,255,255,.10)",
          }}
        />
        {/* Inner bezel */}
        <div
          style={{
            position: "absolute",
            inset: "6%",
            borderRadius: "999px",
            background: "linear-gradient(180deg, rgba(0,0,0,.55), rgba(0,0,0,.85))",
            border: "1px solid rgba(255,255,255,.10)",
          }}
        />

        <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: "10%", width: "80%", height: "80%" }}>
          <defs>
            <clipPath id={`orb-${id}`}>
              <circle cx="50" cy="50" r="48" />
            </clipPath>

            <clipPath id={`fill-${id}`}>
              <rect x="0" y={fillY * 100} width="100" height="100" />
            </clipPath>

            <radialGradient id={`blood-${id}`} cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#ff6a6a" stopOpacity="0.95" />
              <stop offset="35%" stopColor="#c01616" stopOpacity="0.95" />
              <stop offset="70%" stopColor="#6b0000" stopOpacity="0.98" />
              <stop offset="100%" stopColor="#220000" stopOpacity="1" />
            </radialGradient>

            <radialGradient id={`vignette-${id}`} cx="50%" cy="50%" r="60%">
              <stop offset="55%" stopColor="#000" stopOpacity="0" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.65" />
            </radialGradient>

            <linearGradient id={`glass-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.30" />
              <stop offset="45%" stopColor="#fff" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </linearGradient>

            <filter id={`swirl-${id}`}>
              <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="7">
                <animate attributeName="baseFrequency" dur="6s" values="0.018;0.024;0.018" repeatCount="indefinite" />
              </feTurbulence>
              <feDisplacementMap in="SourceGraphic" scale="8" />
            </filter>
          </defs>

          <g clipPath={`url(#orb-${id})`}>
            <circle cx="50" cy="50" r="48" fill="#120000" />

            <g clipPath={`url(#fill-${id})`}>
              <circle cx="50" cy="50" r="48" fill={`url(#blood-${id})`} />
              <g filter={`url(#swirl-${id})`} opacity="0.35">
                <circle cx="44" cy="46" r="52" fill={`url(#blood-${id})`} />
              </g>
            </g>

            {/* meniscus shadow */}
            <ellipse
              cx="50"
              cy={fillY * 100}
              rx="46"
              ry="6"
              fill="#000"
              opacity={pct > 0.02 ? 0.20 : 0}
            />

            {/* edge vignette */}
            <circle cx="50" cy="50" r="48" fill={`url(#vignette-${id})`} />

            {/* glass highlight */}
            <path
              d="M18,32 C28,14 52,10 70,18 C78,22 83,28 86,36"
              fill="none"
              stroke="#fff"
              strokeOpacity="0.22"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              d="M22,40 C30,24 50,18 66,24"
              fill="none"
              stroke="#fff"
              strokeOpacity="0.12"
              strokeWidth="4"
              strokeLinecap="round"
            />

            <circle cx="50" cy="50" r="48" fill={`url(#glass-${id})`} opacity="0.55" />
          </g>
        </svg>

        {/* damage flash overlay */}
        <div
          style={{
            pointerEvents: "none",
            position: "absolute",
            inset: "10%",
            borderRadius: 999,
            background: "rgba(239,68,68,.25)",
            opacity: flash ? 1 : 0,
            transition: "opacity 150ms ease",
          }}
        />

        {/* Label plate */}
        {(label || showNumbers) && (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: -10, display: "flex", justifyContent: "center" }}>
            <div
              style={{
                borderRadius: 999,
                padding: "6px 10px",
                background: "rgba(0,0,0,.55)",
                border: "1px solid rgba(255,255,255,.10)",
                backdropFilter: "blur(8px)",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".3px", color: "rgba(255,255,255,.88)" }}>
                {label}
                {showNumbers && (
                  <span style={{ marginLeft: 8, fontVariantNumeric: "tabular-nums", color: "rgba(255,255,255,.70)" }}>
                    {Math.max(0, Math.floor(value))}/{Math.max(1, Math.floor(max))}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)", fontVariantNumeric: "tabular-nums" }}>
        {(pct * 100).toFixed(0)}%
      </div>

      <style jsx global>{`
        @keyframes lu_d2pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
      `}</style>
    </div>
  );
}
