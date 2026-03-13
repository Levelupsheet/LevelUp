"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import GameEngine from "@/components/GameEngine";

type Exam = "A_PLUS" | "SECURITY_PLUS" | "AZ_900";

export default function CertMCQPage() {
  const router = useRouter();
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

  const examLabel = useMemo(() => (exam === "A_PLUS" ? "A+" : exam === "SECURITY_PLUS" ? "Security+" : "AZ-900"), [exam]);

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 1280 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <div className="muted" style={{ fontWeight: 700 }}>Certification Trial • {examLabel}</div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn d2Roman" onClick={() => setExam("A_PLUS")} style={{ opacity: exam === "A_PLUS" ? 1 : 0.6 }}>A+</button>
            <button className="btn d2Roman" onClick={() => setExam("SECURITY_PLUS")} style={{ opacity: exam === "SECURITY_PLUS" ? 1 : 0.6 }}>Security+</button>
            <button className="btn d2Roman" onClick={() => setExam("AZ_900")} style={{ opacity: exam === "AZ_900" ? 1 : 0.6 }}>AZ-900</button>
          </div>
        </div>

        <GameEngine lane="CERTIFICATIONS" certExam={exam} title="Certification Trial" subtitle={`Certification practice • ${examLabel}`} metaLeft={`Exam: ${examLabel}`} exitHref="/dashboard" exitLabel="Close" />
      </div>
    </div>
  );
}
