"use client";

import Link from "next/link";

export default function SweepstakesPage() {
  return (
    <main style={{ minHeight: "100vh" }} className="dashboardBg">
      <div className="dashWrap" style={{ paddingTop: 96, paddingBottom: 48 }}>
        <div className="glass" style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div className="muted" style={{ fontSize: 12, letterSpacing: 0.2 }}>Sweep Stakes</div>
              <h1 style={{ margin: "6px 0 0 0", fontSize: 28, fontWeight: 900 }}>Win real prizes while you level up</h1>
              <div className="muted" style={{ marginTop: 8, maxWidth: 820 }}>
                Entries are earned through progress (XP), challenges, and leaderboard performance. No popups — your entries stack until you choose to use them.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link className="secondaryBtn" href="/start">Back to Start</Link>
              <Link className="gold" href="/dashboard">Go to Dashboard →</Link>
            </div>
          </div>

          <div className="grid3" style={{ marginTop: 16 }}>
            <div className="featureCard">
              <b>How to enter</b>
              <p className="muted" style={{ marginTop: 8 }}>
                Earn entries by leveling up, completing training milestones, and participating in events.
                Some rewards (like Diamond loot) can grant bonus entries.
              </p>
            </div>
            <div className="featureCard">
              <b>Monthly sweepstakes</b>
              <p className="muted" style={{ marginTop: 8 }}>
                Each month features a new prize pool. Winners are selected fairly and logged server-side.
                (We’ll publish official rules and eligibility requirements before launch.)
              </p>
            </div>
            <div className="featureCard">
              <b>Win REAL prizes</b>
              <p className="muted" style={{ marginTop: 8 }}>
                Gift cards, hardware, merch, and premium rewards. Your account shows your entry history and wins.
              </p>
            </div>
          </div>

          <div className="glass" style={{ marginTop: 14, padding: 14 }}>
            <b>Coming next</b>
            <div className="muted" style={{ marginTop: 8 }}>
              • An “Entries” balance in the dashboard • Official rules • Prize gallery • Winner announcements • Anti-abuse checks
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
