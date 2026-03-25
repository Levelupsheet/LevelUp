"use client";

export default function GoogleLoginButton(props: { authenticated?: boolean; compact?: boolean }) {
  const { authenticated = false, compact = false } = props;
  const baseStyle = {
    whiteSpace: "nowrap" as const,
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background: authenticated ? "linear-gradient(180deg, rgba(91, 217, 143, 0.18), rgba(28, 50, 38, 0.68))" : "linear-gradient(180deg, rgba(255,255,255,0.1), rgba(255,255,255,0.04))",
    boxShadow: authenticated ? "0 10px 24px rgba(40,140,90,0.18)" : "0 10px 24px rgba(0,0,0,0.18)",
  };

  if (authenticated) {
    return (
      <a href="/profile" className="secondaryBtn" style={baseStyle} title="Signed in with Google">
        <span aria-hidden="true" style={{ display: "inline-grid", placeItems: "center", width: 20, height: 20, borderRadius: 999, background: "rgba(255,255,255,0.14)", fontSize: 12 }}>✓</span>
        {compact ? "Account" : "Account"}
      </a>
    );
  }

  return (
    <a href="/api/auth/google/start" className="secondaryBtn" style={baseStyle}>
      <span aria-hidden="true" style={{ display: "inline-grid", placeItems: "center", width: 20, height: 20, borderRadius: 999, background: "rgba(255,255,255,0.14)", fontSize: 12 }}>G</span>
      {compact ? "Connect Google" : "Sign in with Google"}
    </a>
  );
}
