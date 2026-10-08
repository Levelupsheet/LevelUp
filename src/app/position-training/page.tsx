"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import GameEngine from "@/components/GameEngine";
import { hydrateAuthenticatedUser, resolveClientUserId } from "@/lib/activeUser";

export default function PositionTrainingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [startingPosition, setStartingPosition] = useState<string>("HELPDESK_SUPPORT");
  const [industry, setIndustry] = useState<string | null>(null);
  const [careerPath, setCareerPath] = useState<string | null>(null);

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

    try {
      const rawCareer = localStorage.getItem("lu_selected_career_path_v1");
      const savedCareer = rawCareer ? JSON.parse(rawCareer) : null;
      if (savedCareer?.careerPath) {
        setIndustry(String(savedCareer.industry || ""));
        setCareerPath(String(savedCareer.careerPath));
      }
    } catch {}

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
      if (mounted) setReady(true);
    })();
    return () => { mounted = false; };
  }, [router]);

  return (
    <div className="page paidAssetPage positionTrainingAssetPage">
      <div className="container" style={{ maxWidth: 1280 }}>
        {ready ? <GameEngine lane="TRAINING" startingPosition={careerPath ? null : startingPosition} industry={industry} careerPath={careerPath} title="Position Training" subtitle={`Role-based training • ${careerPath || startingPosition.replaceAll("_", " ")}`} metaLeft={`Path: ${industry ? industry + " • " : ""}${careerPath || startingPosition.replaceAll("_", " ")}`} exitHref="/dashboard" exitLabel="Close" /> : <p>Loading your selected training path…</p>}
      </div>
    </div>
  );
}
