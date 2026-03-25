"use client";

export default function AuthGateCard({ error }: { error?: string | null }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "radial-gradient(circle at top, rgba(71,124,255,0.18), rgba(4,8,18,0.82) 38%), rgba(4,8,18,0.86)",
        backdropFilter: "blur(14px)",
        zIndex: 60,
        padding: 20,
      }}
    >
      <div className="card" style={{ width: "min(620px, 100%)", padding: 26, borderRadius: 24, border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 30px 80px rgba(0,0,0,0.35)" }}>
        <div className="badge" style={{ marginBottom: 12, borderColor: "rgba(92,170,255,0.35)", background: "rgba(92,170,255,0.10)", color: "#beddff" }}>Secure account access</div>
        <div style={{ fontSize: 28, fontWeight: 950, lineHeight: 1.1 }}>Sign in to launch your LevelUp Pro dashboard</div>
        <div style={{ marginTop: 12, opacity: 0.82, lineHeight: 1.6 }}>
          Connect Google to load your saved XP, sweepstakes status, unlocked modules, and training progress with the same premium UI as the rest of the site.
        </div>
        {error ? (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 14, border: "1px solid rgba(255,90,90,0.45)", background: "rgba(120,20,20,0.22)" }}>
            Google sign-in error: {error}
          </div>
        ) : null}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginTop: 18 }}>
          {[
            "Sync XP and level progress",
            "Restore saved quiz sessions",
            "Unlock premium sweepstakes access",
          ].map((item) => (
            <div key={item} className="card" style={{ padding: 12, background: "rgba(255,255,255,0.04)" }}>{item}</div>
          ))}
        </div>
        <div style={{ display: "grid", gap: 12, marginTop: 22, justifyItems: "center" }}>
          <a className="primaryBtn" href="/api/auth/google/start" style={{ minWidth: 260, justifySelf: "center" }}>Continue with Google</a>
          <a className="secondaryBtn" href="/start" style={{ minWidth: 140, justifySelf: "center" }}>Back</a>
        </div>
      </div>
    </div>
  );
}
