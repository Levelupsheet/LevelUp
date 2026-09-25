"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getActiveUser } from "@/lib/userStore";
import RewardsHistoryModal from "@/components/RewardsHistoryModal";
import { levelFromXp } from "@/lib/progression";

export default function ProfileModal(props: {
  open: boolean;
  onClose: () => void;
  userLabel?: string;
}) {
  const { open, onClose, userLabel } = props;

  const [tick] = useState(0);
  const [summary, setSummary] = useState<any>(null);
  const [learning, setLearning] = useState<any>(null);
  const [rewardsOpen, setRewardsOpen] = useState(false);
  const [sweepStats, setSweepStats] = useState<any>(null);
  const active = useMemo(() => getActiveUser(), [open, tick]);
  const userId = (active as any)?.id ?? "demo-user";

  // Portal target: avoids "position: fixed" being trapped by a transformed ancestor.
  const mountNode = useMemo(() => {
    if (typeof window === "undefined") return null;
    return document.body;
  }, []);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    // prevent background scroll while modal is open
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);


  useEffect(() => {
    if (!open) return;
    fetch("/api/sweepstakes/summary", { cache: "no-store" as any })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("Failed to load sweepstakes")))
      .then((j) => setSweepStats(j?.user || null))
      .catch(() => setSweepStats(null));
  }, [open, userId, tick]);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      fetch("/api/users/summary", { cache: "no-store" as any }).then((r) => r.ok ? r.json() : null),
      fetch("/api/learning/profile", { cache: "no-store" as any }).then((r) => r.ok ? r.json() : null),
    ]).then(([userSummary, learningProfile]) => {
      setSummary(userSummary?.ok ? userSummary : null);
      setLearning(learningProfile?.ok ? learningProfile?.profile : null);
    }).catch(() => {
      setSummary(null);
      setLearning(null);
    });
  }, [open]);

  if (!open || !mountNode) return null;

  return createPortal(
    <div
      className="luModalOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="Profile"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="luModal" style={{ maxWidth: 860, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div className="luModalHeader">
          <div>
            <div className="luModalTitle">Profile</div>
            <div className="luModalSub">{userLabel ?? "Guest"}</div>
          </div>
          <button className="luIconBtn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="luModalBody" style={{ overflowY: "auto", overscrollBehavior: "contain" }}>
          <div className="grid2">
            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <h3 style={{ marginTop: 0 }}>Account</h3>
              <p className="muted" style={{ marginTop: 6 }}>
                Manage your training identity, rewards, and sweepstakes activity from one place.
              </p>
              <div className="divider" />

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ minWidth: 220 }}>
                  <div className="muted" style={{ fontSize: 12 }}>Active user</div>
                  <div style={{ fontWeight: 700 }}>{active.displayName}</div>
                  <div className="muted" style={{ fontSize: 12 }}>XP: <b>{active.xp}</b></div>
                  <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button className="btn" type="button" onClick={() => setRewardsOpen(true)}>🎁 View Rewards</button>
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: 260, display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                  <button className="btn" type="button" onClick={async () => {
                    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
                    window.location.href = "/start";
                  }}>Sign out</button>
                </div>
              </div>

              <div className="divider" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 14 }}>
                <div className="luInset" style={{ padding: 12 }}>
                  <div className="muted" style={{ fontSize: 12 }}>Level</div>
                  <div style={{ fontSize: 24, fontWeight: 900 }}>{levelFromXp(Number(active.xp || 0))}</div>
                </div>
                <div className="luInset" style={{ padding: 12 }}>
                  <div className="muted" style={{ fontSize: 12 }}>Sweepstakes entered</div>
                  <div style={{ fontSize: 24, fontWeight: 900 }}>{Array.isArray(sweepStats?.activeEnteredCampaignIds) ? sweepStats.activeEnteredCampaignIds.length : 0}</div>
                </div>
                <div className="luInset" style={{ padding: 12 }}>
                  <div className="muted" style={{ fontSize: 12 }}>Entries this week</div>
                  <div style={{ fontSize: 24, fontWeight: 900 }}>{Number(sweepStats?.weeklyCount || 0)} / {Number(sweepStats?.weeklyLimit || 5)}</div>
                </div>
              </div>
              <div className="divider" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                <div className="luInset" style={{ padding: 12 }}><div className="muted" style={{ fontSize: 12 }}>Overall mastery</div><div style={{ fontSize: 22, fontWeight: 900 }}>{Number(learning?.overallMastery || 0).toFixed(0)}%</div></div>
                <div className="luInset" style={{ padding: 12 }}><div className="muted" style={{ fontSize: 12 }}>Plan</div><div style={{ fontSize: 22, fontWeight: 900 }}>{String(summary?.subscriptionTier || "FREE")}</div></div>
                <div className="luInset" style={{ padding: 12 }}><div className="muted" style={{ fontSize: 12 }}>Tokens</div><div style={{ fontSize: 22, fontWeight: 900 }}>{Number(summary?.tokenBalance ?? sweepStats?.tokenBalance ?? 0)}</div></div>
              </div>
              <div style={{ display: "none" }}>{tick}</div>
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>Mastery insights</h3>
              <p className="muted" style={{ marginTop: 6 }}>Your strongest areas and the domains that deserve the next training session.</p>
              <div className="divider" />
              {(learning?.masteryByDomain || []).slice().sort((a: any, b: any) => Number(b.mastery) - Number(a.mastery)).map((row: any) => (
                <div key={row.domain} style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 8 }}>
                  <span>{String(row.domain).replace(/_/g, " ")}</span><b>{Number(row.mastery || 0).toFixed(0)}%</b>
                </div>
              ))}
              {!learning?.masteryByDomain?.length ? <p className="muted">Complete training questions to build your mastery profile.</p> : null}
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Quick links</h3>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <a className="btn" href="/dashboard">
                  Go to dashboard →
                </a>
                <a className="btn" href="/sweepstakes">
                  Open sweepstakes →
                </a>
              </div>
            </div>
            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <h3 style={{ marginTop: 0 }}>Sweepstakes activity</h3>
              <p className="muted" style={{ marginTop: 6 }}>
                Token balance: <b>{Number(sweepStats?.tokenBalance || 0)}</b> • Weekly entries: <b>{Number(sweepStats?.weeklyCount || 0)}</b>
              </p>
            </div>
          </div>
        </div>
      </div>
            <RewardsHistoryModal open={rewardsOpen} onClose={() => setRewardsOpen(false)} userId={userId} />
</div>,
    mountNode
  );
}