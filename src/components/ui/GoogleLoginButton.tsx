"use client";
export default function GoogleLoginButton(props: { authenticated?: boolean; compact?: boolean }) {
  const { authenticated = false, compact = false } = props;
  if (authenticated) {
    return <a href="/profile" className="secondaryBtn" style={{ whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 8 }} title="Signed in with Google"><span aria-hidden="true">●</span>{compact ? "Google" : "Google Connected"}</a>;
  }
  return <a href="/api/auth/google" className="secondaryBtn" style={{ whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 8 }}><span aria-hidden="true">G</span>{compact ? "Google" : "Sign in with Google"}</a>;
}
