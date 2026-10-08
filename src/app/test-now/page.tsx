"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useContentPools } from "@/lib/useContentPools";
import { testNowBanks } from "@/lib/contentPools";
import GameEngine from "@/components/GameEngine";

export default function TestNowPage() {
  const router = useRouter();
  const { pools, loading, error } = useContentPools();
  const banks = testNowBanks(pools).filter(b => b.questionCount > 0);
  const [bankDomain, setBankDomain] = useState("MIXED");
  const [trainingMode, setTrainingMode] = useState<"STANDARD" | "WEAK_DOMAIN" | "MISSED_QUESTIONS" | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("lu_module_gate_v1");
      const gate = raw ? JSON.parse(raw) : null;
      const ok = gate && gate.target === "test-now" && typeof gate.exp === "number" && gate.exp > Date.now();
      if (!ok) {
        router.replace("/dashboard");
        return;
      }
      localStorage.removeItem("lu_module_gate_v1");
    } catch {
      router.replace("/dashboard");
    }
  }, [router]);

  if (!trainingMode) {
    return (
      <div className="page paidAssetPage testNowAssetPage">
        <div className="container" style={{ maxWidth: 760 }}>
          <div className="card paidAssetHero testNowSetupPanel" style={{ padding: 22, textAlign: "center" }}>
            <h2 style={{ marginTop: 0 }}>Choose Test Now Training</h2>
            <p className="muted">Run a normal adaptive test or concentrate the session on your weakest measured domain.</p>
            {loading ? <p>Loading active banks…</p> : error ? <p role="alert">{error}</p> : !banks.length ? <p>No active Test Now pools. Publish one in Admin → Question Pools.</p> : <label>Question bank <select value={bankDomain} onChange={e => setBankDomain(e.target.value)}>{banks.map(bank => <option key={bank.domain} value={bank.domain}>{bank.label} ({bank.questionCount})</option>)}</select></label>}
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 18 }}>
              <button className="btn gdActionOrange" disabled={loading || !!error || !banks.length} onClick={() => setTrainingMode("STANDARD")}>STANDARD TEST</button>
              <button className="btn gdActionBlue" disabled={loading || !!error || !banks.length} onClick={() => setTrainingMode("WEAK_DOMAIN")}>WEAK DOMAIN TRAINING</button>
              <button className="btn gdActionBlue" disabled={loading || !!error || !banks.length} onClick={() => setTrainingMode("MISSED_QUESTIONS")}>MISSED QUESTION REVIEW</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 1280 }}>
        <GameEngine bankDomain={bankDomain === "MIXED" ? undefined : bankDomain} lane="TEST_NOW" title="Test Now!" subtitle={trainingMode === "WEAK_DOMAIN" ? "Weak Domain Training" : trainingMode === "MISSED_QUESTIONS" ? "Master Your Missed Questions" : "Timed combat quiz"} trainingMode={trainingMode} timed exitHref="/dashboard" exitLabel="Close" />
      </div>
    </div>
  );
}
