"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import GameEngine from "@/components/GameEngine";

export default function TestNowPage() {
  const router = useRouter();

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

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 1280 }}>
        <GameEngine lane="TEST_NOW" title="Test Now!" subtitle="Timed combat quiz" timed exitHref="/dashboard" exitLabel="Close" />
      </div>
    </div>
  );
}
