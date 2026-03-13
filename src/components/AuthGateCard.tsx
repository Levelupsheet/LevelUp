"use client";

export default function AuthGateCard({ error }: { error?: string | null }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "rgba(4,8,18,0.72)",
        backdropFilter: "blur(8px)",
        zIndex: 60,
        padding: 20,
      }}
    >
      <div className="card" style={{ width: "min(560px, 100%)", padding: 22, borderRadius: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 900 }}>Sign in to enter your dashboard</div>
        <div style={{ marginTop: 10, opacity: 0.82, lineHeight: 1.55 }}>
          LevelUp Pro now uses your Google account to load your profile, XP, progress, and saved training state from PostgreSQL.
        </div>
        {error ? (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 14, border: "1px solid rgba(255,90,90,0.45)", background: "rgba(120,20,20,0.22)" }}>
            Google sign-in error: {error}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
          <a className="primaryBtn" href="/api/auth/google/start">Continue with Google</a>
          <a className="secondaryBtn" href="/">Back</a>
        </div>
      </div>
    </div>
  );
}
