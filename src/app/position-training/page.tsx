"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import GameEngine from "@/components/GameEngine";
import { hydrateAuthenticatedUser, resolveClientUserId } from "@/lib/activeUser";
import { canonicalTrainingTarget } from "@/lib/contentPools";
import { normalizeCareerTarget, isPublishedCareer } from "@/lib/careerPreference";

export default function PositionTrainingPage() {
  const router = useRouter();

  async function exitTraining() {
    try {
      const response = await fetch("/api/learning/session?lane=TRAINING", { cache: "no-store" as any });
      const json = await response.json().catch(() => null);
      const activeSessionId = String(json?.session?.id || "");
      if (activeSessionId) {
        await fetch("/api/learning/session", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: activeSessionId, status: "ABANDONED" }),
        });
      }
    } catch {}
    router.replace("/dashboard");
  }
  const [ready, setReady] = useState(false);
  const [startingPosition, setStartingPosition] = useState<string>("");
  const [industry, setIndustry] = useState<string | null>(null);
  const [careerPath, setCareerPath] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);

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
        const [sJson, preference, catalog] = await Promise.all([
          fetch(`/api/users/summary?userId=${encodeURIComponent(userId)}`,{cache:"no-store" as any}).then(r=>r.json()),
          fetch("/api/users/career",{cache:"no-store" as any}).then(r=>r.json()),
          fetch("/api/career-paths",{cache:"no-store" as any}).then(r=>r.json()),
        ]);
        let cached: any = null;
        try {cached = JSON.parse(localStorage.getItem("lu_selected_career_path_v1") || "null");} catch {}
        const sp = sJson?.user?.startingPosition || "";
        const target = normalizeCareerTarget(preference.career || cached || canonicalTrainingTarget({startingPosition:sp}));
        const pools = (catalog.paths || []).map((path: any) => ({...path,lane:"TRAINING"}));
        if (!target || !isPublishedCareer(target,pools)) throw new Error("Choose a career with published training content from the dashboard.");
        if (!preference.career) {
          const saved = await fetch("/api/users/career",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(target)});
          if (!saved.ok) throw new Error("Could not save career selection. Choose your path again from the dashboard.");
        }
        if (mounted) {setStartingPosition(sp);setIndustry(target.industry);setCareerPath(target.careerPath);setReady(true);}
      } catch (error: any) {if(mounted) setSelectionError(error.message || "Could not load your career selection");}
    })();
    return () => { mounted = false; };
  }, [router]);

  return (
    <div className="page paidAssetPage positionTrainingAssetPage">
      <div className="container positionTrainingGameContainer">
        {selectionError ? <p role="alert">{selectionError} <a href="/dashboard">Choose career</a></p> : ready ? <GameEngine lane="TRAINING" playerPosition={startingPosition || null} industry={industry} careerPath={careerPath} title="Career Training" subtitle={`Career training • ${careerPath}`} metaLeft={`Path: ${industry} • ${careerPath}`} exitHref="/dashboard" exitLabel="Close" onExit={() => void exitTraining()} /> : <p>Loading your selected training path…</p>}
      </div>
    </div>
  );
}
