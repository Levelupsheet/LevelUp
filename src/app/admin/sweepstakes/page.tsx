"use client";

import { useEffect, useState } from "react";

export default function AdminSweepstakesPage() {
  const [campaign, setCampaign] = useState<any>(null);
  const [prizePools, setPrizePools] = useState<Record<string, any>>({});
  const [status, setStatus] = useState("");
  const [prizePoolLabel, setPrizePoolLabel] = useState("");
  const [prizePoolCents, setPrizePoolCents] = useState(0);

  async function loadCampaign() {
    const res = await fetch("/api/admin/sweepstakes/campaign", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (data?.ok) {
      setCampaign(data.campaign);
      setPrizePools(data.prizePools || {});
      setPrizePoolLabel(String(data.campaign?.prizePoolLabel || ""));
      setPrizePoolCents(Number(data.campaign?.prizePoolCents || 0));
    }
  }

  useEffect(() => { loadCampaign(); }, []);

  async function saveCampaign(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Saving...");
    const res = await fetch("/api/admin/sweepstakes/campaign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prizePoolLabel, prizePoolCents }),
    });
    const data = await res.json().catch(() => ({}));
    setStatus(data?.ok ? "Campaign updated." : data?.error || "Update failed.");
    if (data?.ok) loadCampaign();
  }

  async function drawWinner() {
    setStatus("Drawing winner...");
    const res = await fetch("/api/admin/sweepstakes/draw", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ campaignId: campaign?.id }) });
    const data = await res.json().catch(() => ({}));
    if (data?.ok) {
      setStatus(data?.winner ? `Winner drawn: ${data.winner.user?.email || data.winner.userId}` : "No eligible entries to draw from.");
      loadCampaign();
    } else {
      setStatus(data?.error || "Draw failed.");
    }
  }

  return (
    <main className="dashboardBg" style={{ minHeight: "100vh" }}>
      <div className="dashWrap" style={{ paddingTop: 96, paddingBottom: 40 }}>
        <div className="glass" style={{ padding: 18 }}>
          <h1 style={{ marginTop: 0 }}>Sweepstakes Admin</h1>
          <div className="muted">Manage the active prize pool, monitor live contribution pools, and draw a winner from verified entries.</div>

          <form onSubmit={saveCampaign} style={{ display: "grid", gap: 10, maxWidth: 520, marginTop: 16 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Prize pool label</span>
              <input value={prizePoolLabel} onChange={(e) => setPrizePoolLabel(e.target.value)} placeholder="$250 + merch bundle" />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Prize pool cents</span>
              <input value={prizePoolCents} onChange={(e) => setPrizePoolCents(Number(e.target.value || 0))} type="number" min={0} />
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="primaryBtn" type="submit">Save campaign</button>
              <button className="secondaryBtn" type="button" onClick={drawWinner}>Draw winner</button>
            </div>
          </form>

          <div className="grid3" style={{ marginTop: 16 }}>
            {Object.values(prizePools || {}).map((pool: any) => (
              <div key={pool.poolType} className="featureCard">
                <b>{pool.poolType}</b>
                <p className="muted" style={{ marginTop: 8 }}>{pool.label}</p>
              </div>
            ))}
          </div>

          {campaign ? (
            <div className="glass" style={{ marginTop: 16, padding: 14 }}>
              <div><b>{campaign.title}</b></div>
              <div className="muted" style={{ marginTop: 6 }}>Status: {campaign.status}</div>
              <div className="muted">Window: {new Date(campaign.startsAt).toLocaleString()} → {new Date(campaign.endsAt).toLocaleString()}</div>
              <div className="muted">Prize pool: {campaign.prizePoolLabel || `$${(Number(campaign.prizePoolCents || 0) / 100).toFixed(2)}`}</div>
            </div>
          ) : null}

          {status ? <div className="muted" style={{ marginTop: 14 }}>{status}</div> : null}
        </div>
      </div>
    </main>
  );
}
