"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useContentPools } from "@/lib/useContentPools";
import GameEngine from "@/components/GameEngine";

type Exam = "A_PLUS" | "SECURITY_PLUS" | "AZ_900" | "AWS" | "AZURE";

export default function CertMCQPage() {
  const router = useRouter();
  const { pools, loading, error } = useContentPools();
  const exams = pools.filter(p => p.lane === "CERTIFICATIONS");
  const [exam, setExam] = useState<Exam>("A_PLUS");

  useEffect(() => {
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
    }
  }, [router]);

  const selectedExam = exams.find(p => p.certExam === exam) || exams[0];
  const examLabel = useMemo(() => selectedExam?.label || (exam === "A_PLUS" ? "A+" : exam === "SECURITY_PLUS" ? "Security+" : exam === "AZ_900" ? "AZ-900" : exam === "AZURE" ? "Azure" : "AWS"), [exam, selectedExam?.label]);

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 1280 }}>
        <div className="learningSessionToolbar">
          <div className="muted" style={{ fontWeight: 700 }}>Certification Trial • {examLabel}</div>
          <div className="learningExamTabs">
            {exams.map(pool => <button key={pool.key} className="btn d2Roman" onClick={() => setExam(pool.certExam as Exam)} style={{ opacity: selectedExam?.key === pool.key ? 1 : 0.6 }}>{pool.label} ({pool.questionCount})</button>)}
          </div>
        </div>

        {loading ? <p>Loading certification pools…</p> : error ? <p role="alert">{error}</p> : !selectedExam ? <p>No active certification pools. Publish one in Admin → Question Pools.</p> : <GameEngine lane="CERTIFICATIONS" certExam={selectedExam.certExam} title="Certification Trial" subtitle={`Certification practice • ${examLabel}`} metaLeft={`Exam: ${examLabel}`} exitHref="/dashboard" exitLabel="Close" />}
      </div>
    </div>
  );
}
