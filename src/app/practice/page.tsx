"use client";

import { useMemo, useState } from "react";

type Snapshot = { xp: number; readiness: number; rankLabel: string; qualifiedForHR: boolean };

const domains = ["Networking","Windows","Active Directory","M365/Exchange","Printers","Security/Endpoint","Ticket Triage","Customer Comms"] as const;

export default function PracticePage() {
  const [tier, setTier] = useState<1 | 2 | 3 | 4>(1);
  const [domain, setDomain] = useState<(typeof domains)[number]>("Networking");
  const [question, setQuestion] = useState("A user says the internet is down. Walk through your troubleshooting steps.");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const canSubmit = useMemo(() => answer.trim().length >= 20, [answer]);

  async function submit() {
    setLoading(true);
    try {
      const res = await fetch("/api/practice/answer", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ track: "IT_SUPPORT", tier, domain, prompt: question, answer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Request failed");
      setSnapshot(data.snapshot);
      setAnswer("");
    } catch (e: any) {
      console.error(e.message ?? "Error");
    } finally { setLoading(false); }
  }

  return (
    <main className="practiceWorkspace page">
      <div className="container practiceWorkspaceInner">
        <section className="card practiceMainCard">
          <div className="dashboardEyebrow">SKILL PRACTICE</div>
          <h1>Practice IT Support</h1>
          <p className="practiceIntro">Work through a real-world support prompt. Structure your answer around checks, tools, actions, and expected outcomes.</p>
          <div className="row">
            <div style={{ flex: "1 1 260px" }}>
              <label>Domain</label>
              <select value={domain} onChange={(e) => setDomain(e.target.value as any)}>
                {domains.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <label>Tier</label>
              <select value={tier} onChange={(e) => setTier(Number(e.target.value) as any)}>
                <option value={1}>Tier 1</option><option value={2}>Tier 2</option><option value={3}>Tier 3</option><option value={4}>Tier 4</option>
              </select>
            </div>
          </div>
          <label style={{ display: "block", marginTop: 12 }}>Question prompt</label>
          <textarea rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} />
          <label style={{ display: "block", marginTop: 12 }}>Your answer</label>
          <textarea rows={8} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Answer in steps. Tools, checks, expected outcomes." />
          <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button disabled={!canSubmit || loading} onClick={submit}>{loading ? "Submitting..." : "Submit Answer"}</button>
            <a href="/dashboard">Dashboard</a>
            <small>{!canSubmit ? "Tip: write at least a few sentences so grading is meaningful." : " "}</small>
          </div>
        </section>
        <aside className="card practiceSnapshot">
          <h2>Snapshot</h2>
          {snapshot ? (
            <>
              <p><b>Rank</b>: {snapshot.rankLabel}</p><p><b>XP</b>: {snapshot.xp}</p>
              <p><b>Readiness</b>: {snapshot.readiness.toFixed(0)}%</p>
              <p><b>HR Invite</b>: {snapshot.qualifiedForHR ? "Eligible" : "Not yet"}</p>
              <hr style={{ borderColor: "rgba(255,255,255,0.14)" }} />
              <p><small>Next: pass HR → tech ping scheduled 15–30 mins later → pass tech → offer + 90-day badge.</small></p>
            </>
          ) : <p><small>Submit an answer to see your rank/readiness snapshot.</small></p>}
        </aside>
      </div>
    </main>
  );
}
