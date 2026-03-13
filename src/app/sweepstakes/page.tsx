"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type SummaryResponse = {
  ok: boolean;
  campaign?: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    prizePoolLabel?: string | null;
    prizePoolCents: number;
    totalEntries: number;
  };
  enabled?: boolean;
  prizePools?: Record<string, { label: string; currentAmount: number }>;
  user?: {
    userId: string;
    weeklyCount: number;
    campaignEntries: number;
    remainingThisWeek: number;
    weeklyLimit: number;
    sources: { source: string; quantity: number }[];
  } | null;
};

export default function SweepstakesPage() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState("dev-pass");
  const [status, setStatus] = useState<string>("");
  const [verificationUrl, setVerificationUrl] = useState<string>("");

  useEffect(() => {
    fetch("/api/sweepstakes/summary", { cache: "no-store" })
      .then((r) => r.json())
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  const params = useSearchParams();
  const freeEntryState = params.get("freeEntry");
  const weeklyPoolLabel = summary?.prizePools?.WEEKLY_GOLDEN_POOL?.label || summary?.campaign?.prizePoolLabel || `$${((summary?.campaign?.prizePoolCents || 0) / 100).toFixed(2)}`;
  const isLive = Boolean(summary?.enabled);

  async function submitFreeEntry(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Submitting free entry...");
    setVerificationUrl("");

    const res = await fetch("/api/sweepstakes/free-entry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, captchaToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      setStatus(data?.error || "Could not create free entry.");
      return;
    }
    setStatus(data?.message || "Verification required.");
    setVerificationUrl(String(data?.verificationUrl || ""));
  }

  return (
    <main style={{ minHeight: "100vh" }} className="dashboardBg">
      <div className="dashWrap" style={{ paddingTop: 96, paddingBottom: 48 }}>
        <div className="glass" style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div className="muted" style={{ fontSize: 12, letterSpacing: 0.2 }}>Sweepstakes</div>
              <h1 style={{ margin: "6px 0 0 0", fontSize: 28, fontWeight: 900 }}>Win real prizes while you level up</h1>
              <div className="muted" style={{ marginTop: 8, maxWidth: 820 }}>
                Earn entries from golden questions, boss battles, chest rewards, and one free entry form. Weekly entry cap: 5 per user.
                {!isLive ? " Sweepstakes are prelaunch right now, so public free entry is disabled until go-live." : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link className="secondaryBtn" href="/start">Back to Start</Link>
              <Link className="gold" href="/dashboard">Go to Dashboard →</Link>
            </div>
          </div>

          <div className="grid3" style={{ marginTop: 16 }}>
            <div className="featureCard">
              <b>Prize Pool Total</b>
              <p className="muted" style={{ marginTop: 8 }}>
                {weeklyPoolLabel}
                <br />
                Weekly golden pool. Subscription revenue contributions roll into this automatically.
              </p>
            </div>
            <div className="featureCard">
              <b>Total Entries</b>
              <p className="muted" style={{ marginTop: 8 }}>
                {summary?.campaign?.totalEntries ?? 0}
                <br />
                Total submitted entries in the active sweepstakes window.
              </p>
            </div>
            <div className="featureCard">
              <b>User Entries</b>
              <p className="muted" style={{ marginTop: 8 }}>
                {summary?.user ? `${summary.user.campaignEntries} this campaign • ${summary.user.weeklyCount}/${summary.user.weeklyLimit} this week` : "Sign in to track your entries"}
                <br />
                Remaining this week: {summary?.user?.remainingThisWeek ?? 5}
              </p>
            </div>
          </div>

          {!isLive ? (
            <div className="glass" style={{ marginTop: 16, padding: 16, border: "1px solid rgba(255,215,0,0.28)" }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>Sweepstakes status</div>
              <div className="muted" style={{ marginTop: 8 }}>
                Sweepstakes are configured in the database, but public entry is currently disabled. When you are ready to go live, set <code>SWEEPSTAKES_PUBLIC_ENABLED=true</code> and restart the app.
              </div>
            </div>
          ) : null}

          <div className="glass" style={{ marginTop: 16, padding: 16, opacity: isLive ? 1 : 0.7 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Free entry form</div>
            <div className="muted" style={{ marginTop: 6, marginBottom: 12 }}>
              Submit one free entry per person, then verify your email to finalize the entry. In development, use captcha token <code>dev-pass</code> unless Turnstile is configured. {!isLive ? " Public submissions are currently disabled." : ""}
            </div>
            <form onSubmit={submitFreeEntry} style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(160px, 220px) auto", gap: 10 }}>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" type="email" required />
              <input value={captchaToken} onChange={(e) => setCaptchaToken(e.target.value)} placeholder="captcha token" required />
              <button className="primaryBtn" type="submit" disabled={!isLive}>Submit free entry</button>
            </form>
            {status ? <div className="muted" style={{ marginTop: 10 }}>{status}</div> : null}
            {verificationUrl ? (
              <div style={{ marginTop: 10 }}>
                <a href={verificationUrl} className="gold">Verify this free entry</a>
              </div>
            ) : null}
            {freeEntryState ? (
              <div style={{ marginTop: 10 }} className="muted">
                Verification status: {freeEntryState}
                {params.get("message") ? ` — ${params.get("message")}` : ""}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
