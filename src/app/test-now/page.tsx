"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DiabloQuizRunner, { type DiabloQuestion } from "@/components/DiabloQuizRunner";

const FALLBACK: DiabloQuestion[] = [
  {
    prompt: "A user cannot access any websites but can ping 8.8.8.8 successfully. What is the MOST likely issue?",
    choices: ["Default gateway", "DNS server", "Duplex mismatch", "IP conflict"],
    correctIndex: 1,
    explanation: "If IP connectivity works (ping 8.8.8.8) but names fail, DNS is the likely culprit.",
  },
];

function fmtTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function TestNowPage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<DiabloQuestion[]>([]);
  const [setLabel, setSetLabel] = useState<string>("Test Now");
  const [loading, setLoading] = useState(true);

  const [secondsLeft, setSecondsLeft] = useState(15 * 60);
  const [timeUp, setTimeUp] = useState(false);

  useEffect(() => {
    // Gate: this module should be launched from Dashboard → Start Now.
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
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/content/active?lane=TEST_NOW", { cache: "no-store" as any });
        const json = await res.json();
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
            setSetLabel(json?.set?.name ? `Test Now · ${json.set.name}` : "Test Now");
          } else {
            setQuestions(FALLBACK);
            setSetLabel("Test Now · Sample");
          }
        }
      } catch {
        if (mounted) {
          setQuestions(FALLBACK);
          setSetLabel("Test Now · Sample");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [router]);

  useEffect(() => {
    if (loading || timeUp) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [loading, timeUp]);

  useEffect(() => {
    if (secondsLeft === 0 && !timeUp) setTimeUp(true);
  }, [secondsLeft, timeUp]);

  const timeLabel = useMemo(() => (timeUp ? "Time Up" : `Time: ${fmtTime(secondsLeft)}`), [secondsLeft, timeUp]);

  if (loading) {
    return (
      <div className="page">
        <div className="container" style={{ maxWidth: 1120 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Loading Test…</div>
            <div className="muted" style={{ marginTop: 8 }}>Pulling the active set from your admin placement.</div>
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
              Assign a set to <b>TEST_NOW</b> in the Admin portal, or upload questions to a set first.
            </div>
            <div style={{ marginTop: 14 }}>
              <Link className="btn" href="/admin">Open Admin</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 1180 }}>
        <DiabloQuizRunner
          title="Test Now!"
          subtitle={setLabel}
          enemyName="Lagger"
          questions={questions}
          metaRight={timeLabel}
          forceFinish={timeUp}
          exitHref="/dashboard"
          exitLabel="Close"
        />
      </div>
    </div>
  );
}
