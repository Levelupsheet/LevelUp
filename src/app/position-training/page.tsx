"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DiabloQuizRunner, { type DiabloQuestion } from "@/components/DiabloQuizRunner";

const FALLBACK: DiabloQuestion[] = [
  {
    prompt: "No training set assigned yet. Assign a set to TRAINING for your starting position in Admin.",
    choices: ["Open Admin", "", "", ""],
    correctIndex: 0,
    explanation: "In Admin → select a set → Assign → Use for Training.",
  },
];

export default function PositionTrainingPage() {
  const router = useRouter();
  const userId = "demo-user"; // TODO: replace with real auth later

  const [startingPosition, setStartingPosition] = useState<string | null>(null);
  const [questions, setQuestions] = useState<DiabloQuestion[]>([]);
  const [setLabel, setSetLabel] = useState<string>("Position Training");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Gate: this module should be launched from Dashboard → Start Now.
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
      try {
        const sRes = await fetch(`/api/users/summary?userId=${encodeURIComponent(userId)}`, { cache: "no-store" as any });
        const sText = await sRes.text();
        let sJson: any = null;
        try { sJson = sText ? JSON.parse(sText) : null; } catch { sJson = null; }
        const sp = sJson?.user?.startingPosition || null;
        if (mounted) setStartingPosition(sp);

        const url = sp
          ? `/api/content/active?lane=TRAINING&startingPosition=${encodeURIComponent(sp)}`
          : `/api/content/active?lane=TRAINING&startingPosition=HELPDESK_SUPPORT`;

        const res = await fetch(url, { cache: "no-store" as any });
        const text = await res.text();
        let json: any = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }

        const qs = (json?.questions || []).map((q: any) => ({
          id: q.id,
          prompt: q.prompt,
          choices: Array.isArray(q.choices) ? q.choices : q.choices?.choices || q.choices,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
        })) as DiabloQuestion[];

        if (mounted) {
          if (qs.length) {
            setQuestions(qs);
            const human = sp ? sp.replaceAll("_", " ") : "your path";
            setSetLabel(json?.set?.name ? `Training · ${human} · ${json.set.name}` : `Training · ${human}`);
          } else {
            setQuestions(FALLBACK);
            setSetLabel("Training · Sample");
          }
        }
      } catch {
        if (mounted) {
          setQuestions(FALLBACK);
          setSetLabel("Training · Sample");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [router]);

  if (loading) {
    return (
      <div className="page">
        <div className="container" style={{ maxWidth: 1120 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Loading Training…</div>
            <div className="muted" style={{ marginTop: 8 }}>Pulling your assigned training set.</div>
          </div>
        </div>
      </div>
    );
  }

  if (!questions.length) {
    return (
      <div className="page">
        <div className="container" style={{ maxWidth: 1120 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>No questions available</div>
            <div className="muted" style={{ marginTop: 8 }}>
              Assign a set to <b>TRAINING</b> for your starting position in the Admin portal.
            </div>
            <div style={{ marginTop: 14 }}>
              <Link className="btn" href="/admin">Open Admin</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const pathLabel = startingPosition ? startingPosition.replaceAll("_", " ") : "Not set";

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 1180 }}>
        <DiabloQuizRunner
          title="Position Training"
          subtitle={setLabel}
          enemyName="Lagger"
          questions={questions}
          metaLeft={`Path: ${pathLabel}`}
          exitHref="/dashboard"
          exitLabel="Close"
        />
      </div>
    </div>
  );
}
