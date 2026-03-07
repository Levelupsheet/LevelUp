"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DiabloQuizRunner, { type DiabloQuestion } from "@/components/DiabloQuizRunner";

type Exam = "A_PLUS" | "SECURITY_PLUS" | "AZ_900";

export default function CertMCQPage() {
  const router = useRouter();
  const [exam, setExam] = useState<Exam>("A_PLUS");
  const [questions, setQuestions] = useState<DiabloQuestion[]>([]);
  const [setLabel, setSetLabel] = useState<string>("Certifications");
  const [loading, setLoading] = useState(true);

  const examLabel = useMemo(() => {
    if (exam === "A_PLUS") return "A+";
    if (exam === "SECURITY_PLUS") return "Security+";
    return "AZ-900";
  }, [exam]);

  useEffect(() => {
    // Gate: this module should be launched from Dashboard → Start Now.
    try {
      const raw = localStorage.getItem("lu_module_gate_v1");
      const gate = raw ? JSON.parse(raw) : null;
      const ok = gate && gate.target === "cert-mcq" && typeof gate.exp === "number" && gate.exp > Date.now();
      if (!ok) {
        router.replace("/dashboard");
        return;
      }
      localStorage.removeItem("lu_module_gate_v1");
    } catch {
      router.replace("/dashboard");
      return;
    }
  }, [router]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/content/active?lane=CERTIFICATIONS&certExam=${encodeURIComponent(exam)}`, { cache: "no-store" as any });
        const json = await res.json();

        const qs = (json?.questions || []).map((q: any) => ({
          id: q.id,
          prompt: q.prompt,
          choices: Array.isArray(q.choices) ? q.choices : q.choices?.choices || q.choices,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
        })) as DiabloQuestion[];

        if (mounted) {
          setQuestions(qs);
          setSetLabel(json?.set?.name ? `Certifications · ${examLabel} · ${json.set.name}` : `Certifications · ${examLabel}`);
        }
      } catch {
        if (mounted) setQuestions([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [exam, examLabel]);

  if (loading) {
    return (
      <div className="page">
        <div className="container" style={{ maxWidth: 1120 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Loading Certification Set…</div>
            <div className="muted" style={{ marginTop: 8 }}>Fetching your assigned {examLabel} practice set.</div>
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
            <div style={{ fontWeight: 900, fontSize: 18 }}>No certification set assigned</div>
            <div className="muted" style={{ marginTop: 8 }}>
              In Admin → select a set → Assign → Use for Certifications ({examLabel}).
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link className="btn" href="/admin">Open Admin</Link>
              <Link className="btn" href="/dashboard">Back</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 1180 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <div className="muted" style={{ fontWeight: 700 }}>{setLabel}</div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn d2Roman" onClick={() => setExam("A_PLUS")} style={{ opacity: exam === "A_PLUS" ? 1 : 0.6 }}>A+</button>
            <button className="btn d2Roman" onClick={() => setExam("SECURITY_PLUS")} style={{ opacity: exam === "SECURITY_PLUS" ? 1 : 0.6 }}>Security+</button>
            <button className="btn d2Roman" onClick={() => setExam("AZ_900")} style={{ opacity: exam === "AZ_900" ? 1 : 0.6 }}>AZ-900</button>
          </div>
        </div>

        <DiabloQuizRunner
          title="Certification Trial"
          subtitle={setLabel}
          enemyName="Lagger"
          questions={questions}
          metaLeft={`Exam: ${examLabel}`}
          exitHref="/dashboard"
          exitLabel="Close"
        />
      </div>
    </div>
  );
}
