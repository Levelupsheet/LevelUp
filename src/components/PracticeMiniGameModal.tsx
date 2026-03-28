"use client";

import React, { useEffect, useState } from "react";
import GameEngine from "@/components/GameEngine";
import type { DiabloQuestion, DiabloQuizRunSummary } from "@/components/DiabloQuizRunner";
import { applyBossAbilitiesToQuestions, bossCombatRules, bossVisualMeta, buildBossProfile, mapBossQuestion, selectBossQuestions } from "@/lib/bossBattle";
import { getActiveUser } from "@/lib/userStore";

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
  const [step, setStep] = useState<"setup" | "quiz" | "summary" | "boss">("setup");
  const [path, setPath] = useState<PositionPath>(defaultPath ?? "HELPDESK_SUPPORT");
  const [cert, setCert] = useState<CertTrack>("A_PLUS");
  const [finalScore, setFinalScore] = useState<{ correct: number; total: number; xp: number; timeLeft?: number; bestStreak?: number }>({ correct: 0, total: 0, xp: 0 });
  const [learningPath, setLearningPath] = useState<any | null>(null);
  const [bossReady, setBossReady] = useState(false);
  const [bossLoading, setBossLoading] = useState(false);
  const [bossConsumed, setBossConsumed] = useState(false);
  const [bossQuestions, setBossQuestions] = useState<DiabloQuestion[]>([]);
  const [bossRules, setBossRules] = useState<any>(null);
  const [bossMeta, setBossMeta] = useState<{ bossName: string; bossLabel: string; introTitle: string; variant: string } | null>(null);
  const [bossReward, setBossReward] = useState<{ xp: number; won: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("setup");
    setFinalScore({ correct: 0, total: 0, xp: 0 });
    setLearningPath(null);
    setBossReady(false);
    setBossLoading(false);
    setBossConsumed(false);
    setBossQuestions([]);
    setBossRules(null);
    setBossMeta(null);
    setBossReward(null);
  }, [open]);

  if (!open) return null;

  const title = kind === "position" ? "Position training" : kind === "cert" ? "Certification practice" : "Test now!";
  const subtitle = "";

  const lane = kind === "position" ? "TRAINING" : kind === "cert" ? "CERTIFICATIONS" : "TEST_NOW";

  function bossProgressKey() {
    return `lu_boss_progress_${lane}_${path}_${cert}`;
  }

  function shouldOfferBoss(summary: DiabloQuizRunSummary & { awardedXp?: number }) {
    const accuracy = summary.totalQuestions > 0 ? summary.correctCount / summary.totalQuestions : 0;
    if (accuracy < 0.7) return false;
    let chance = 0.2;
    if (accuracy >= 0.8) chance = 0.35;
    if (accuracy >= 0.9) chance = 0.5;
    if (accuracy >= 1) chance = 0.75;
    try {
      const raw = localStorage.getItem(bossProgressKey());
      const parsed = raw ? JSON.parse(raw) : { misses: 0 };
      const misses = Number(parsed?.misses || 0);
      if (misses >= 2) {
        localStorage.setItem(bossProgressKey(), JSON.stringify({ misses: 0 }));
        return true;
      }
      const hit = Math.random() < chance;
      localStorage.setItem(bossProgressKey(), JSON.stringify({ misses: hit ? 0 : misses + 1 }));
      return hit;
    } catch {
      return Math.random() < chance;
    }
  }

  async function buildBossRun(summary: DiabloQuizRunSummary & { awardedXp?: number }) {
    setBossLoading(true);
    try {
      const search = new URLSearchParams();
      search.set("lane", lane);
      search.set("questionCount", "12");
      search.set("shuffle", "1");
      if (kind === "position") search.set("startingPosition", path);
      if (kind === "cert") search.set("certExam", cert);
      const res = await fetch(`/api/content/active?${search.toString()}`, { cache: "no-store" as any });
      const json = await res.json().catch(() => null);
      const sourceQuestions = Array.isArray(json?.questions) ? json.questions : [];
      const activeUser = getActiveUser();
      const weakestDomain = learningPath?.weakAreas?.[0]?.domain || learningPath?.predictedWeaknesses?.[0]?.domain || learningPath?.focusDomain || "general";
      const isGolden = summary.correctCount === summary.totalQuestions && Math.random() < 0.12;
      const profile = buildBossProfile({
        weakestDomain,
        userXp: Number((activeUser as any)?.xp || 0),
        sessionCorrectCount: summary.correctCount,
        sessionTotalQuestions: summary.totalQuestions,
        selectedQuestions: sourceQuestions,
        isGolden,
      });
      const picked = selectBossQuestions(sourceQuestions, 3, weakestDomain).map((q: any) => mapBossQuestion(q, weakestDomain));
      const applied = applyBossAbilitiesToQuestions(picked, profile);
      const visual = bossVisualMeta(isGolden);
      setBossQuestions(applied.map((q: any) => ({
        id: q.id,
        prompt: q.prompt,
        type: q.type as any,
        choices: q.choices,
        correctIndex: q.correctIndex,
        data: q.data as any,
        explanation: q.explanation,
        domainId: q.domainId,
        level: q.level,
      })));
      setBossRules(bossCombatRules(profile));
      setBossMeta(visual);
      setBossReady(true);
      setBossConsumed(false);
    } catch {
      setBossReady(false);
    } finally {
      setBossLoading(false);
    }
  }

  function finishRun(summary: DiabloQuizRunSummary & { awardedXp?: number }) {
    setFinalScore({ correct: summary.correctCount, total: summary.totalQuestions, xp: summary.awardedXp ?? summary.xpEarned, timeLeft: summary.timeLeft, bestStreak: summary.bestStreak });
    setStep("summary");
    fetch("/api/learning/path", { cache: "no-store" as any })
      .then((res) => res.json().catch(() => null))
      .then((json) => { if (json?.learningPath) setLearningPath(json.learningPath); })
      .catch(() => {});
    try { const raw = localStorage.getItem("lu_users"); if (raw && onXpChange) { const list = JSON.parse(raw); const activeId = localStorage.getItem("lu_active_user_id"); const active = Array.isArray(list) ? list.find((x: any) => x.id === activeId) : null; if (active) onXpChange(Number(active.xp || 0), Number(active.level || 1)); } } catch {}
    if (step !== "boss" && !bossConsumed && shouldOfferBoss(summary)) buildBossRun(summary);
  }

  return (
    <div className="luModalOverlay" onMouseDown={onClose}>
      <div className="luModal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()} style={{ width: (step === "quiz" || step === "boss") ? "min(96vw, 1800px)" : "min(92vw, 980px)", maxWidth: (step === "quiz" || step === "boss") ? 1800 : 980 }}>
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
              {kind === "position" && <div style={{ display: "grid", gap: 10 }}><div style={{ fontWeight: 800 }}>Choose your path</div><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{([ ["HELPDESK_SUPPORT", "Helpdesk"], ["DESKTOP_TECHNICIAN", "Desktop"], ["CLOUD_ENGINEER", "Cloud"] ] as const).map(([k, label]) => <button key={k} className={"trackBtn" + (path === k ? " active" : "")} type="button" onClick={() => setPath(k)}>{label}</button>)}</div><small className="luHint">12 questions • 4 stages • 3 questions per stage</small></div>}
              {kind === "cert" && <div style={{ display: "grid", gap: 10 }}><div style={{ fontWeight: 800 }}>Choose a certification pack</div><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{([ ["A_PLUS", "A+"], ["SECURITY_PLUS", "Security+"], ["AZ_900", "AZ-900"], ["AWS", "AWS"], ["AZURE", "Azure"] ] as const).map(([k, label]) => <button key={k} className={"trackBtn" + (cert === k ? " active" : "")} type="button" onClick={() => setCert(k)}>{label}</button>)}</div><small className="luHint">12 questions • 4 stages • 3 questions per stage</small></div>}
              {kind === "test" && <div style={{ display: "grid", gap: 10 }}><div style={{ fontWeight: 800 }}>Quick timed check</div><small className="luHint">15 questions • 5 stages • timer scales by question difficulty</small></div>}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}><button className="primaryBtn" type="button" onClick={() => setStep("quiz")}>Start →</button></div>
            </div>
          )}

          {step === "quiz" && (
            <GameEngine
              lane={lane}
              title={title}
              subtitle={subtitle}
              timed={kind === "test"}
              startingPosition={kind === "position" ? path : undefined}
              certExam={kind === "cert" ? cert : undefined}
              exitLabel="Close"
              onExit={onClose}
              metaLeft={kind === "position" ? `Path: ${path.replaceAll("_", " ")}` : kind === "cert" ? `Exam: ${cert.replaceAll("_", " ")}` : "Timed mode"}
              questionCount={kind === "test" ? 15 : 12}
              onComplete={finishRun as any}
            />
          )}

          {step === "boss" && bossReady && bossMeta && (
            <GameEngine
              lane={lane}
              title={bossMeta.bossLabel}
              subtitle={`${title} • bonus challenge`}
              timed
              enemyName={bossMeta.bossName}
              exitLabel="Back"
              onExit={() => setStep("summary")}
              metaLeft="Bonus boss"
              metaRight="3 questions"
              questionsOverride={bossQuestions}
              rulesOverride={bossRules}
              encounterType="boss"
              onComplete={(summary: any) => {
                setBossReward({ xp: Number(summary?.awardedXp || summary?.xpEarned || 0), won: summary?.outcome === "victory" });
                setBossConsumed(true);
                setBossReady(false);
                setStep("summary");
              }}
            />
          )}

          {step === "summary" && (
            <div className="card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}><div><div style={{ fontSize: 18, fontWeight: 950 }}>Run complete</div><small className="luHint">XP was synced to the user profile and DB.</small></div><span className="badge">+{finalScore.xp} XP</span></div>
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div className="card" style={{ padding: 12, background: "rgba(255,255,255,0.04)" }}><b>Score</b>: {finalScore.correct} / {finalScore.total}</div>
                {kind === "test" && <div className="card" style={{ padding: 12, background: "rgba(255,255,255,0.04)" }}><b>Time left</b>: {Math.max(0, finalScore.timeLeft || 0)}s</div>}
                {typeof finalScore.bestStreak === "number" ? <div className="card" style={{ padding: 12, background: "rgba(255,255,255,0.04)" }}><b>Best streak</b>: {finalScore.bestStreak}</div> : null}
                {bossMeta && !bossConsumed ? (
                  <div className="card stage7BossSummaryCard">
                    <div className="stage7BossSummaryTitle">{bossMeta.introTitle}</div>
                    <div className="muted stage7BossSummaryCopy">A rare bonus boss battle rolled for this run. Clear it once for bonus XP. After the fight, this run is complete.</div>
                    <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button className="primaryBtn" type="button" onClick={() => { setBossConsumed(true); setStep("boss"); }} disabled={!bossReady || bossLoading}>{bossLoading ? "Preparing…" : `Start ${bossMeta.bossLabel}`}</button>
                    </div>
                  </div>
                ) : null}
                {bossReward ? <div className="card" style={{ padding: 12, background: bossReward.won ? "rgba(46,204,113,0.08)" : "rgba(255,255,255,0.04)" }}><b>{bossReward.won ? "Boss cleared" : "Boss attempt completed"}</b>: +{bossReward.xp} XP<div className="muted" style={{ marginTop: 6 }}>This bonus fight has been consumed for this run.</div></div> : null}
              </div>
              <div className="stage5SummaryGrid" style={{ marginTop: 12 }}>
                <div className="card" style={{ padding: 12, background: "rgba(255,255,255,0.04)" }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Next learning focus</div>
                  {learningPath?.recommendations?.length ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      {learningPath.recommendations.slice(0, 3).map((item: string, idx: number) => (
                        <div key={idx} className="stage5SummaryNote">{item}</div>
                      ))}
                    </div>
                  ) : <div className="muted">Complete more sessions to build your adaptive path.</div>}
                </div>
                <div className="card" style={{ padding: 12, background: "rgba(255,255,255,0.04)" }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Readiness snapshot</div>
                  <div className="stage5SummaryMetric">{typeof learningPath?.readinessScore === "number" ? `${learningPath.readinessScore}%` : "—"}</div>
                  <div className="muted">Momentum: {learningPath?.momentum || "BUILDING"}</div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                {!bossReward ? <button className="secondaryBtn" type="button" onClick={() => setStep("setup")}>Try again</button> : null}
                <button className="primaryBtn" type="button" onClick={onClose}>{bossReward ? "Finish" : "Done"}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
