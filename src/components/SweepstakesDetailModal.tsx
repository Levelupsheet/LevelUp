"use client";

import { useEffect, useMemo, useState } from "react";

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
  termsUrl?: string | null;
  winner?: { userId: string; displayName: string; drawnAt?: string | null } | null;
  leaderboard: LeaderboardRow[];
};

function fmtTime(ms: number) {
  if (ms <= 0) return "Drawing complete";
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
  return `${h}h ${m}m ${s}s`;
}

export default function SweepstakesDetailModal({ open, onClose, campaign, currentUserId }: { open: boolean; onClose: () => void; campaign: Campaign | null; currentUserId?: string | null }) {
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  const countdown = useMemo(() => {
    if (!campaign) return "";
    const target = campaign.winner ? new Date(campaign.drawnAt || campaign.endsAt).getTime() : new Date(campaign.endsAt).getTime();
    return fmtTime(target - now);
  }, [campaign, now]);

  if (!open || !campaign) return null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1200, display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="glass" style={{ width: "min(980px, 96vw)", maxHeight: "90vh", overflow: "auto", padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Live sweepstakes</div>
            <h2 style={{ margin: "6px 0 0 0", fontWeight: 900 }}>{campaign.title}</h2>
            <div className="muted" style={{ marginTop: 8 }}>{campaign.prizePoolLabel || "Prize pool TBD"} • {campaign.totalEntries} entries • {campaign.totalParticipants} participants</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span className="badge">{campaign.winner ? "Winner selected" : "Countdown"}: {countdown}</span>
            <button className="secondaryBtn" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="grid2" style={{ marginTop: 14, alignItems: "start" }}>
          <div className="card">
            <div style={{ fontWeight: 800, fontSize: 18 }}>Sweepstakes details</div>
            <div className="muted" style={{ marginTop: 8 }}>Starts {new Date(campaign.startsAt).toLocaleString()}</div>
            <div className="muted">Draws {new Date(campaign.endsAt).toLocaleString()}</div>
            {campaign.termsUrl ? <a href={campaign.termsUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10 }}>Official rules</a> : null}
            <div style={{ marginTop: 14, fontWeight: 700 }}>Winner</div>
            {campaign.winner ? (
              <div className="featureCard" style={{ marginTop: 10, borderColor: "rgba(255,215,80,0.35)", background: "rgba(255,215,80,0.08)" }}>
                <div style={{ fontWeight: 800 }}>{campaign.winner.displayName}</div>
                <div className="muted" style={{ marginTop: 6 }}>Drawn {campaign.winner.drawnAt ? new Date(campaign.winner.drawnAt).toLocaleString() : new Date(campaign.endsAt).toLocaleString()}</div>
              </div>
            ) : (
              <div className="muted" style={{ marginTop: 8 }}>Winner will be selected automatically when the drawing closes.</div>
            )}
          </div>

          <div className="card">
            <div style={{ fontWeight: 800, fontSize: 18 }}>Entry leaderboard</div>
            <div className="muted" style={{ marginTop: 8 }}>Top users in the current pool. Winner is highlighted after the draw.</div>
            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {campaign.leaderboard.length ? campaign.leaderboard.map((row, idx) => (
                <div key={`${row.userId}-${idx}`} style={{ padding: 10, borderRadius: 12, border: row.isWinner ? "1px solid rgba(255,215,80,0.5)" : row.userId === currentUserId ? "1px solid rgba(120,200,255,0.45)" : "1px solid rgba(255,255,255,0.08)", background: row.isWinner ? "rgba(255,215,80,0.09)" : row.userId === currentUserId ? "rgba(120,200,255,0.08)" : "rgba(255,255,255,0.03)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{idx + 1}. {row.displayName}</div>
                      <div className="muted" style={{ marginTop: 4 }}>{row.quantity} entries • {row.tickets} ticket grants</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {row.userId === currentUserId ? <span className="badge">You</span> : null}
                      {row.isWinner ? <span className="badge">Winner</span> : null}
                    </div>
                  </div>
                </div>
              )) : <div className="muted">No entries yet for this drawing.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
