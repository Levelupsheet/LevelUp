"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Entitlements = {
  tier: string;
  rewardsTrack: string;
  lootLuck: number;
  xpMultiplier: number;
  perks: string[];
};

const TIERS = [
  { name: "Bronze", desc: "Level-up crate. Mostly tokens + XP.", items: ["🪙 Tokens (common)", "⚡ XP reward (uncommon)", "🏅 Badge / cosmetic (rare, later)"] },
  { name: "Silver", desc: "Better odds + larger payouts.", items: ["🪙 More tokens", "⚡ Larger XP rewards", "🎟️ Raffle entry (rare)"] },
  { name: "Gold", desc: "Rare drops are more likely.", items: ["⚡ Big XP", "🎟️ Raffle entry", "🏷️ Coupon / merch credit"] },
  { name: "Platinum", desc: "High-value crate.", items: ["🎟️ Guaranteed premium slot (later)", "🏷️ Bigger coupons", "💎 Prize eligibility (rare)"] },
  { name: "Diamond", desc: "Leaderboard + paid prizes (real world).", items: ["💎 Real-world prizes", "🏷️ Premium rewards", "🎟️ High-value entries"] },
];

export default function RewardsPage() {
  const [ent, setEnt] = useState<Entitlements | null>(null);
  useEffect(() => { fetch('/api/subscription/entitlements', { cache: 'no-store' as any }).then(r => r.json()).then(d => setEnt(d?.entitlements || null)).catch(() => {}); }, []);
  return (
    <main className="luPage">
      <div className="luTopRow" style={{ marginBottom: 14 }}>
        <div>
          <h1 className="luH1" style={{ margin: 0 }}>Rewards</h1>
          <div className="muted" style={{ marginTop: 6 }}>What you can win from loot boxes.</div>
          {ent ? <div className="muted" style={{ marginTop: 6 }}>Active track: <b>{ent.rewardsTrack}</b> • Loot luck {ent.lootLuck.toFixed(2)}x • XP boost {ent.xpMultiplier.toFixed(2)}x</div> : null}
        </div>
        <Link href="/dashboard" className="btn">← Back to dashboard</Link>
      </div>

      {ent ? (
        <div className="luCard" style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{ent.tier} reward track</div>
              <div className="muted" style={{ marginTop: 6 }}>Your current plan changes loot odds, XP acceleration, and premium reward eligibility.</div>
            </div>
            <a href="/start#pricing" className="btn">Manage Plan</a>
          </div>
          <ul style={{ marginTop: 10, paddingLeft: 18 }}>
            {ent.perks.map((i) => <li key={i} style={{ marginTop: 6 }}>{i}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="luGrid" style={{ display: "grid", gap: 12 }}>
        {TIERS.map((t, idx) => (
          <div key={t.name} className="luCard" style={{ padding: 14, opacity: !ent ? 1 : idx < 2 || ent.rewardsTrack !== 'core' ? 1 : 0.92 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{t.name} Loot Box</div>
              <div className="luPill">Preview</div>
            </div>
            <div className="muted" style={{ marginTop: 6 }}>{t.desc}</div>
            <ul style={{ marginTop: 10, paddingLeft: 18 }}>
              {t.items.map((i) => <li key={i} style={{ marginTop: 6 }}>{i}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </main>
  );
}
