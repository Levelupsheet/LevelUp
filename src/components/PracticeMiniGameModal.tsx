"use client";

import React, { useEffect, useState } from "react";
import GameEngine from "@/components/GameEngine";
import type { DiabloQuizRunSummary } from "@/components/DiabloQuizRunner";

type Kind = "position" | "cert" | "test";
type PositionPath = "HELPDESK_SUPPORT" | "DESKTOP_TECHNICIAN" | "CLOUD_ENGINEER";
type CertTrack = "A_PLUS" | "SECURITY_PLUS" | "AZ_900" | "AWS" | "AZURE";

export default function PracticeMiniGameModal(props: {
  open: boolean;
  kind: Kind;
  defaultPath?: PositionPath;
  onClose: () => void;
  onXpChange?: (xp: number, level: number) => void;
}) {
  const { open, kind, defaultPath, onClose, onXpChange } = props;
  const [step, setStep] = useState<"setup" | "quiz" | "summary">("setup");
  const [path, setPath] = useState<PositionPath>(defaultPath ?? "HELPDESK_SUPPORT");
  const [cert, setCert] = useState<CertTrack>("A_PLUS");
  const [finalScore, setFinalScore] = useState<{ correct: number; total: number; xp: number; timeLeft?: number }>({ correct: 0, total: 0, xp: 0 });

  useEffect(() => {
    if (!open) return;
    setStep("setup");
    setFinalScore({ correct: 0, total: 0, xp: 0 });
  }, [open]);

  if (!open) return null;

  const title = kind === "position" ? "Position training" : kind === "cert" ? "Certification practice" : "Test now!";
  const subtitle = kind === "position" ? "Role-based questions from your DB" : kind === "cert" ? "Certification pack from your DB" : "Timed combat quiz from your DB";

  function finishRun(summary: DiabloQuizRunSummary & { awardedXp?: number }) {
    setFinalScore({ correct: summary.correctCount, total: summary.totalQuestions, xp: summary.awardedXp ?? summary.xpEarned, timeLeft: summary.timeLeft });
    setStep("summary");
    try { const raw = localStorage.getItem("lu_users"); if (raw && onXpChange) { const list = JSON.parse(raw); const activeId = localStorage.getItem("lu_active_user_id"); const active = Array.isArray(list) ? list.find((x: any) => x.id === activeId) : null; if (active) onXpChange(Number(active.xp || 0), Number(active.level || 1)); } } catch {}
  }

  return (
    <div className="luModalOverlay" onMouseDown={onClose}>
      <div className="luModal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()} style={{ width: step === "quiz" ? "min(96vw, 1800px)" : "min(92vw, 980px)", maxWidth: step === "quiz" ? 1800 : 980 }}>
        <div className="luVideoBg" aria-hidden="true">
          <video className="luVideoEl" autoPlay loop muted playsInline preload="metadata"><source src="/video/blackhole-loop.mp4" type="video/mp4" /></video>
          <div className="luVideoVignette" />
        </div>
        <div className="luModalHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><b style={{ fontSize: 18 }}>{title}</b><div><small className="luHint">{subtitle}</small></div></div>
          <button className="secondaryBtn" type="button" onClick={onClose}>✕</button>
        </div>

        <div className="luModalBody">
          {step === "setup" && (
            <div className="card" style={{ padding: 14 }}>
              {kind === "position" && <div style={{ display: "grid", gap: 10 }}><div style={{ fontWeight: 800 }}>Choose your path</div><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{([ ["HELPDESK_SUPPORT", "Helpdesk"], ["DESKTOP_TECHNICIAN", "Desktop"], ["CLOUD_ENGINEER", "Cloud"] ] as const).map(([k, label]) => <button key={k} className={"trackBtn" + (path === k ? " active" : "")} type="button" onClick={() => setPath(k)}>{label}</button>)}</div><small className="luHint">8 randomized MCQs per run • pulled from DB first</small></div>}
              {kind === "cert" && <div style={{ display: "grid", gap: 10 }}><div style={{ fontWeight: 800 }}>Choose a certification pack</div><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{([ ["A_PLUS", "A+"], ["SECURITY_PLUS", "Security+"], ["AZ_900", "AZ-900"], ["AWS", "AWS"], ["AZURE", "Azure"] ] as const).map(([k, label]) => <button key={k} className={"trackBtn" + (cert === k ? " active" : "")} type="button" onClick={() => setCert(k)}>{label}</button>)}</div><small className="luHint">8 randomized MCQs per run • pulled from DB first</small></div>}
              {kind === "test" && <div style={{ display: "grid", gap: 10 }}><div style={{ fontWeight: 800 }}>Quick timed check</div><small className="luHint">10 mixed questions • timer scales by question difficulty</small></div>}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}><button className="primaryBtn" type="button" onClick={() => setStep("quiz")}>Start →</button></div>
            </div>
          )}

          {step === "quiz" && (
            <GameEngine
              lane={kind === "position" ? "TRAINING" : kind === "cert" ? "CERTIFICATIONS" : "TEST_NOW"}
              title={title}
              subtitle={subtitle}
              timed={kind === "test"}
              startingPosition={kind === "position" ? path : undefined}
              certExam={kind === "cert" ? cert : undefined}
              exitLabel="Close"
              onExit={onClose}
              metaLeft={kind === "position" ? `Path: ${path.replaceAll("_", " ")}` : kind === "cert" ? `Exam: ${cert.replaceAll("_", " ")}` : "Timed mode"}
              onComplete={finishRun as any}
            />
          )}

          {step === "summary" && (
            <div className="card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}><div><div style={{ fontSize: 18, fontWeight: 950 }}>Run complete</div><small className="luHint">XP was synced to the user profile and DB.</small></div><span className="badge">+{finalScore.xp} XP</span></div>
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}><div className="card" style={{ padding: 12, background: "rgba(255,255,255,0.04)" }}><b>Score</b>: {finalScore.correct} / {finalScore.total}</div>{kind === "test" && <div className="card" style={{ padding: 12, background: "rgba(255,255,255,0.04)" }}><b>Time left</b>: {Math.max(0, finalScore.timeLeft || 0)}s</div>}</div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}><button className="secondaryBtn" type="button" onClick={() => setStep("setup")}>Try again</button><button className="primaryBtn" type="button" onClick={onClose}>Done</button></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
