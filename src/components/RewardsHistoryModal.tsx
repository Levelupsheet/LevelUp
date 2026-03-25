"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type LootDrop = { rewardType: string; rewardRef?: string | null; quantity: number; rarity?: string | null };
type LootBox = { id: string; type: string; status: string; createdAt: string; drops: LootDrop[] };

function iconFor(t: string) {
  if (t === "TOKENS") return "🪙";
  if (t === "XP_BOOST") return "⚡";
  if (t === "BADGE") return "🏅";
  if (t === "RAFFLE_ENTRY") return "🎟️";
  if (t === "COUPON") return "🏷️";
  if (t === "PRIZE") return "💎";
  return "🎁";
}

export default function RewardsHistoryModal(props: {
  open: boolean;
  onClose: () => void;
  userId: string;
}) {
  const { open, onClose, userId } = props;
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const mountNode = useMemo(() => (typeof window === "undefined" ? null : document.body), []);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setErr(null);
    fetch(`/api/loot/history?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) throw new Error(j?.error ?? "Failed to load rewards");
        setData(j);
      })
      .catch((e) => setErr(e?.message ?? "Error"))
      .finally(() => setLoading(false));
  }, [open, userId]);

  if (!open || !mountNode) return null;

  return createPortal(
    <div className="luModalOverlay">
      <div className="luModal" role="dialog" aria-modal="true" aria-label="Rewards">
        <div className="luModalHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <b style={{ fontSize: 18 }}>🎁 Rewards</b>
            <div style={{ opacity: 0.7, marginTop: 2, fontSize: 13 }}>Your claimed loot, wallet, inventory, and rare unlocks.</div>
          </div>
          <button className="luIconBtn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="luModalBody" style={{ display: "grid", gap: 12 }}>
          {loading && <div style={{ opacity: 0.75 }}>Loading…</div>}
          {err && <div style={{ color: "#ffb4b4" }}>{err}</div>}

          {data && (
            <>
              <div className="luCard" style={{ padding: 12, display: "flex", gap: 14, alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Wallet</div>
                  <div style={{ opacity: 0.75, fontSize: 13 }}>Tokens + profile XP</div>
                </div>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <div className="luPill">🪙 {data.wallet?.tokenBalance ?? 0} Tokens</div>
                  <div className="luPill">⚡ {data.user?.xp ?? 0} XP</div>
                </div>
              </div>

              <div className="luCard" style={{ padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Recent Loot</div>
                {(!data.boxes || data.boxes.length === 0) ? (
                  <div style={{ opacity: 0.75 }}>No opened loot yet.</div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {(data.boxes as LootBox[]).map((b) => (
                      <div key={b.id} className="luInset" style={{ padding: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 700 }}>{b.type.toLowerCase()} box</div>
                          <div style={{ opacity: 0.7, fontSize: 12 }}>{new Date(b.createdAt).toLocaleString()}</div>
                        </div>
                        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                          {b.drops.map((d, idx) => (
                            <div key={idx} style={{ display: "flex", justifyContent: "space-between", gap: 10, opacity: 0.95, padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>
                              <div>{iconFor(d.rewardType)} {d.rewardType === "TOKENS" ? `${d.quantity} Tokens` : d.rewardType === "XP_BOOST" ? `${d.quantity} XP` : d.rewardRef ? `${d.rewardRef}` : `${d.rewardType}`}</div>
                              <div style={{ opacity: 0.65, textTransform: "capitalize" }}>{d.rarity ?? ""}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="luCard" style={{ padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Inventory</div>
                {(!data.inventory || data.inventory.length === 0) ? (
                  <div style={{ opacity: 0.75 }}>No saved rewards yet.</div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {(data.inventory as any[]).slice(0, 30).map((item, idx) => (
                      <div key={idx} className="luInset" style={{ padding: 10, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <div>{iconFor(item.itemType)} <b>{item.itemRef || item.itemType}</b></div>
                        <div style={{ opacity: 0.75 }}>x{Number(item.quantity || 1)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    mountNode
  );
}
