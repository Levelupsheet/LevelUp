"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SweepstakesDetailModal from "@/components/SweepstakesDetailModal";

type LeaderboardRow = { userId: string; displayName: string; quantity: number; tickets: number; lastEntryAt?: string | null; isWinner?: boolean };
type Campaign = {
  id: string;
  slug: string;
  title: string;
  status: string;
  startsAt: string;
  endsAt: string;
  drawnAt?: string | null;
  prizePoolLabel?: string | null;
  totalEntries: number;
  totalParticipants: number;
  winner?: { userId: string; displayName: string; drawnAt?: string | null } | null;
  leaderboard: LeaderboardRow[];
};
type Summary = {
  campaign: Campaign | null;
  campaigns: Campaign[];
  user?: { userId: string; campaignEntries: number; weeklyCount: number; remainingThisWeek: number; weeklyLimit: number; sources: Array<{ source: string; quantity: number }> } | null;
  now: string;
};

function fmt(ms: number) {
  if (ms <= 0) return "Drawing complete";
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return d > 0 ? `${d}d ${h}h ${m}m ${s}s` : `${h}h ${m}m ${s}s`;
}

export default function SweepstakesPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [now, setNow] = useState(Date.now());

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/sweepstakes/summary', { cache: 'no-store' as any });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setSummary({
          campaign: data?.campaign || null,
          campaigns: Array.isArray(data?.campaigns) ? data.campaigns : [],
          user: data?.user || null,
          now: data?.now || new Date().toISOString(),
        });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const current = summary?.campaign || null;
  const countdown = useMemo(() => current ? fmt(new Date(current.winner?.drawnAt || current.endsAt).getTime() - now) : '', [current, now]);

  return (
    <main style={{ minHeight: "100vh" }} className="dashboardBg">
      <div className="dashWrap" style={{ paddingTop: 96, paddingBottom: 48 }}>
        <div className="glass" style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div className="muted" style={{ fontSize: 12, letterSpacing: 0.2 }}>Sweepstakes</div>
              <h1 style={{ margin: "6px 0 0 0", fontSize: 30, fontWeight: 900 }}>Live sweepstakes</h1>
              <div className="muted" style={{ marginTop: 8, maxWidth: 820 }}>
                Real entries. Real drawings. Golden questions, boss wins, and selected rewards can add entries to the live pool.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link className="secondaryBtn" href="/start">Back to Start</Link>
              <Link className="gold" href="/dashboard">Go to Dashboard →</Link>
            </div>
          </div>

          {current ? (
            <div className="card" style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 22 }}>{current.title}</div>
                  <div className="muted" style={{ marginTop: 8 }}>{current.prizePoolLabel || 'Prize pool TBD'} • {current.totalEntries} entries • {current.totalParticipants} participants</div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="badge">{current.winner ? 'Winner selected' : 'Draw in'} {countdown}</span>
                  <button className="primary" onClick={() => setSelected(current)}>Open details</button>
                </div>
              </div>
              {summary?.user ? (
                <div className="grid3" style={{ marginTop: 14 }}>
                  <div className="featureCard"><b>Your campaign entries</b><div className="muted" style={{ marginTop: 8 }}>{summary.user.campaignEntries}</div></div>
                  <div className="featureCard"><b>Your weekly total</b><div className="muted" style={{ marginTop: 8 }}>{summary.user.weeklyCount} / {summary.user.weeklyLimit}</div></div>
                  <div className="featureCard"><b>Remaining this week</b><div className="muted" style={{ marginTop: 8 }}>{summary.user.remainingThisWeek}</div></div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid3" style={{ marginTop: 16 }}>
            {(summary?.campaigns || []).map((campaign) => (
              <button key={campaign.id} type="button" className="featureCard" onClick={() => setSelected(campaign)} style={{ textAlign: 'left', cursor: 'pointer' }}>
                <b>{campaign.title}</b>
                <p className="muted" style={{ marginTop: 8 }}>{campaign.prizePoolLabel || 'Prize pool TBD'} • {campaign.totalEntries} entries</p>
                <div className="muted">{campaign.winner ? `Winner: ${campaign.winner.displayName}` : `Draws ${new Date(campaign.endsAt).toLocaleString()}`}</div>
              </button>
            ))}
            {!loading && !(summary?.campaigns || []).length ? <div className="featureCard">No sweepstakes loaded yet.</div> : null}
          </div>

          <div className="glass" style={{ marginTop: 14, padding: 14 }}>
            <b>How entries work</b>
            <div className="muted" style={{ marginTop: 8 }}>
              Golden question wins, golden boss clears, boss victories, loot vault rewards, and approved free entries can add tickets to the active sweepstakes pool. Winners are drawn automatically after the campaign closes and displayed here.
            </div>
          </div>
        </div>
      </div>
      <SweepstakesDetailModal open={Boolean(selected)} onClose={() => setSelected(null)} campaign={selected} currentUserId={summary?.user?.userId || null} />
    </main>
  );
}
