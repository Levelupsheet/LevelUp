"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import GameEngine from "@/components/GameEngine";
import { hydrateAuthenticatedUser, resolveClientUserId } from "@/lib/activeUser";

export default function PositionTrainingPage() {
  const router = useRouter();
  const [startingPosition, setStartingPosition] = useState<string>("HELPDESK_SUPPORT");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("lu_module_gate_v1");
      const gate = raw ? JSON.parse(raw) : null;
      const ok = gate && gate.target === "position-training" && typeof gate.exp === "number" && gate.exp > Date.now();
      if (!ok) {
        router.replace("/dashboard");
        return;
      }
      localStorage.removeItem("lu_module_gate_v1");
    } catch {
      router.replace("/dashboard");
      return;
    }

    let mounted = true;
    (async () => {
      await hydrateAuthenticatedUser();
      const userId = resolveClientUserId();
      try {
        const sRes = await fetch(`/api/users/summary?userId=${encodeURIComponent(userId)}`, { cache: "no-store" as any });
        const sJson = await sRes.json().catch(() => null);
        const sp = sJson?.user?.startingPosition || "HELPDESK_SUPPORT";
        if (mounted) setStartingPosition(sp);
      } catch {}
    })();
    return () => { mounted = false; };
  }, [router]);

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 1280 }}>
        <GameEngine lane="TRAINING" startingPosition={startingPosition} title="Position Training" subtitle={`Role-based training • ${startingPosition.replaceAll("_", " ")}`} metaLeft={`Path: ${startingPosition.replaceAll("_", " ")}`} exitHref="/dashboard" exitLabel="Close" />
      </div>
    </div>
  );
}
