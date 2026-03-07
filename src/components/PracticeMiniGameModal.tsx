"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { awardXp, getActiveUser } from "@/lib/userStore";
import D2LifeOrb from "@/components/D2LifeOrb";
import D2EnemyHealthBar from "@/components/D2EnemyHealthBar";
import DomainRuneBar from "@/components/DomainRuneBar";
import { addActivity } from "@/lib/activityStore";
import {
  CertTrack,
  PositionPath,
  PracticeQuestion,
  getCertPool,
  getPositionPool,
  getTestNowPool,
} from "@/lib/practicePools";
import { useCombatQuiz } from "@/engine/useCombatQuiz";
import type { CombatQuestion } from "@/engine/CombatQuizEngine";

type Kind = "position" | "cert" | "test";

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickN<T>(arr: T[], n: number) {
  return shuffle(arr).slice(0, Math.min(n, arr.length));
}

function inferDomainFromPractice(q: PracticeQuestion): string {
  const t = (q.tags || []).map((x) => String(x).toLowerCase());
  if (t.includes("identity")) return "identity";
  if (t.includes("networking")) return "networking";
  if (t.includes("security")) return "security";
  if (t.includes("windows")) return "windows";
  if (t.includes("printing")) return "printing";
  if (t.includes("performance")) return "performance";
  // fallback to first tag or track
  return (t[0] || q.track || "general").toLowerCase();
}

function levelFromDifficulty(d?: "easy" | "medium" | "hard"): 1 | 2 | 3 {
  if (d === "hard") return 3;
  if (d === "medium") return 2;
  return 1;
}

function labelForDomain(domainId: string) {
  const d = domainId.toLowerCase();
  if (d === "identity") return "Identity";
  if (d === "networking") return "Networking";
  if (d === "security") return "Security";
  if (d === "windows") return "Windows";
  if (d === "printing") return "Printing";
  if (d === "performance") return "Performance";
  return d.replace(/_/g, " ").slice(0, 18);
}

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

  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [finalScore, setFinalScore] = useState<{ correct: number; total: number; xp: number; timeLeft?: number }>({
    correct: 0,
    total: 0,
    xp: 0,
  });

  const [hitPulse, setHitPulse] = useState<null | "player" | "enemy">(null);

  const title = kind === "position" ? "Position training" : kind === "cert" ? "Certification practice" : "Test now!";
  const subtitle =
    kind === "position"
      ? "Role-based questions • XP per correct answer"
      : kind === "cert"
        ? "Practice packs • XP per correct answer"
        : "Timed mini-check • bonus XP for speed";

  const isTimed = kind === "test";

  // Map PracticeQuestion -> CombatQuestion for the shared engine
  const combatQuestions: CombatQuestion[] = useMemo(() => {
    return (questions || []).map((q) => ({
      id: q.id,
      prompt: q.prompt,
      choices: q.choices,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      domainId: inferDomainFromPractice(q),
      level: levelFromDifficulty(q.difficulty),
    }));
  }, [questions]);

  const { state, question, select, clear, submit, next, reset, currentDomainId, currentMastery } = useCombatQuiz({
    questions: combatQuestions,
    timed: isTimed,
    onSubmit: (r) => {
      setHitPulse(r.correct ? "enemy" : "player");
      window.setTimeout(() => setHitPulse(null), 240);
    },
  });

  useEffect(() => {
    if (!open) return;
    // Reset modal each open.
    setStep("setup");
    setQuestions([]);
    setFinalScore({ correct: 0, total: 0, xp: 0 });
    setHitPulse(null);
    reset();
  }, [open, reset]);

  function start() {
    let pool: PracticeQuestion[] = [];
    if (kind === "position") pool = getPositionPool(path);
    if (kind === "cert") pool = getCertPool(cert);
    if (kind === "test") pool = getTestNowPool();

    const count = kind === "test" ? 10 : 8;
    setQuestions(pickN(pool, count));
    setStep("quiz");
  }

  function close() {
    onClose();
  }

  function finishRun(extraBonusXp = 0) {
    const totalXp = state.xpEarned + extraBonusXp;

    // Award XP once at the end (prevents double-award on refresh)
    const u = awardXp(totalXp);
    if (u && onXpChange) onXpChange(u.xp, u.level);

    // Local notification feed (shown on dashboard)
    try {
      const au = getActiveUser();
      addActivity(au.id, {
        type:
          kind === "position"
            ? "COMPLETE_POSITION_TRAINING"
            : kind === "cert"
              ? "COMPLETE_CERT_PRACTICE"
              : "COMPLETE_TEST_NOW",
        title: `${title} complete`,
        body: `Score: ${state.correctCount}/${combatQuestions.length} • +${totalXp} XP`,
      });
    } catch {}

    setFinalScore({
      correct: state.correctCount,
      total: combatQuestions.length,
      xp: totalXp,
      timeLeft: isTimed ? state.timeLeft : undefined,
    });

    setStep("summary");

    // small victory pulse
    try {
      document.body.classList.add("luPulse");
      setTimeout(() => document.body.classList.remove("luPulse"), 900);
    } catch {}
  }

  // Auto-finish if run ends (KO or completed)
  useEffect(() => {
    if (step !== "quiz") return;
    if (!state.finished) return;

    // Timed mode bonus XP based on remaining time (scaled)
    const bonus = isTimed ? Math.max(0, Math.floor(state.timeLeft / 4)) : 0;
    finishRun(bonus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.finished, step]);

  if (!open) return null;

  const playerName = (getActiveUser()?.displayName || "Player").toUpperCase().slice(0, 18);
  const progressPct = combatQuestions.length ? Math.round(((state.idx + 1) / combatQuestions.length) * 100) : 0;
  const domainLabel = labelForDomain(currentDomainId);

  return (
    <div className="luModalOverlay" onMouseDown={close}>
      <div className="luModal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="luVideoBg" aria-hidden="true">
          <video className="luVideoEl" autoPlay loop muted playsInline preload="metadata">
            <source src="/video/blackhole-loop.mp4" type="video/mp4" />
          </video>
          <div className="luVideoVignette" />
        </div>
        <div className="luModalHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <b style={{ fontSize: 18 }}>{title}</b>
            <div>
              <small className="luHint">{subtitle}</small>
            </div>
          </div>
          <button className="secondaryBtn" type="button" onClick={close}>
            ✕
          </button>
        </div>

        <div className="luModalBody">
          {step === "setup" && (
            <div className="card" style={{ padding: 14 }}>
              {kind === "position" && (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontWeight: 800, marginBottom: 2 }}>Choose your path</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {([
                      ["HELPDESK_SUPPORT", "Helpdesk"],
                      ["DESKTOP_TECHNICIAN", "Desktop"],
                      ["CLOUD_ENGINEER", "Cloud"],
                    ] as any).map(([k, label]: [PositionPath, string]) => (
                      <button key={k} className={"trackBtn" + (path === k ? " active" : "")} type="button" onClick={() => setPath(k)}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <small className="luHint">8 randomized MCQs per run • XP on correct answers</small>
                </div>
              )}

              {kind === "cert" && (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontWeight: 800, marginBottom: 2 }}>Choose a certification pack</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {([
                      ["A_PLUS", "A+"],
                      ["SECURITY_PLUS", "Security+"],
                      ["AZ_900", "AZ-900"],
                    ] as any).map(([k, label]: [CertTrack, string]) => (
                      <button key={k} className={"trackBtn" + (cert === k ? " active" : "")} type="button" onClick={() => setCert(k)}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <small className="luHint">8 randomized MCQs per run • XP on correct answers</small>
                </div>
              )}

              {kind === "test" && (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontWeight: 800, marginBottom: 2 }}>Quick timed check</div>
                  <small className="luHint">10 mixed questions • per-question timer that accelerates as difficulty rises</small>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                <button className="primaryBtn" type="button" onClick={start}>
                  Start →
                </button>
              </div>
            </div>
          )}

          {step === "quiz" && question && (
            <div className="modalBody">
              <div className="d2InterviewGrid">
                <div className={hitPulse === "player" ? "d2Shake" : ""}>
                  <D2LifeOrb value={state.playerHP} name={playerName} size={150} />
                </div>

                <div className={"d2QuestionCard " + (hitPulse === "enemy" ? "d2HitFlash" : "")}>
                  <span className="d2Rivet" style={{ left: 12, top: 12 }} />
                  <span className="d2Rivet" style={{ right: 12, top: 12 }} />
                  <span className="d2Rivet" style={{ left: 12, bottom: 12 }} />
                  <span className="d2Rivet" style={{ right: 12, bottom: 12 }} />

                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <div style={{ fontWeight: 900, letterSpacing: 0.6, opacity: 0.9 }}>
                      Q{state.idx + 1} / {combatQuestions.length}
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      {isTimed && (
                        <span className="badge" style={{ fontVariantNumeric: "tabular-nums" }}>
                          ⏱ {Math.max(0, state.timeLeft)}s
                        </span>
                      )}
                      <span className="badge">XP +{state.xpEarned}</span>
                      <span className="badge">{progressPct}%</span>
                    </div>
                  </div>

                  <div style={{ marginTop: 12, fontSize: 18, fontWeight: 900 }}>{question.prompt}</div>

                  {/* Domain mastery rune bar under question (your request) */}
                  <DomainRuneBar domainLabel={domainLabel} mastery={currentMastery} tier={state.tier} />

                  <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                    {question.choices.map((c, i) => {
                      const isSel = state.selected === i;
                      const isOk = state.locked && i === question.correctIndex;
                      const isBad = state.locked && isSel && i !== question.correctIndex;

                      const extraStyle: React.CSSProperties = {};
                      if (isOk) extraStyle.borderColor = "rgba(46, 204, 113, 0.55)";
                      if (isBad) extraStyle.borderColor = "rgba(255, 90, 90, 0.55)";

                      return (
                        <button
                          key={i}
                          type="button"
                          className={"d2ChoiceBtn" + (isSel ? " selected" : "")}
                          onClick={() => select(i)}
                          disabled={state.locked}
                          style={extraStyle}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>

                  <div className="d2ActionRow" style={{ marginTop: 14 }}>
                    {!state.locked ? (
                      <>
                        <button className="d2Btn" onClick={() => submit()} disabled={state.selected == null}>
                          SUBMIT
                        </button>
                        <button className="d2Btn" onClick={() => clear()}>
                          CLEAR
                        </button>
                      </>
                    ) : (
                      <button className="d2Btn" onClick={() => next()}>
                        NEXT
                      </button>
                    )}
                  </div>

                  {state.locked && (
                    <div style={{ marginTop: 12 }}>
                      <div className="card" style={{ padding: 12, background: "rgba(255,255,255,0.04)" }}>
                        <div style={{ fontWeight: 950 }}>
                          {state.lastWasCorrect ? "✅ Correct" : "❌ Not quite"}
                        </div>
                        <div style={{ opacity: 0.9, marginTop: 6 }}>{state.feedback}</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className={hitPulse === "enemy" ? "d2Shake" : ""}>
                  <D2EnemyHealthBar name="LAGGER" value={state.enemyHP} />
                  <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>
                    Right answers damage the enemy • Wrong answers damage you
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === "summary" && (
            <div className="card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 950 }}>Run complete</div>
                  <small className="luHint">XP is saved to your local profile.</small>
                </div>
                <span className="badge">+{finalScore.xp} XP</span>
              </div>
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div className="card" style={{ padding: 12, background: "rgba(255,255,255,0.04)" }}>
                  <b>Score</b>: {finalScore.correct} / {finalScore.total}
                </div>
                {kind === "test" && (
                  <div className="card" style={{ padding: 12, background: "rgba(255,255,255,0.04)" }}>
                    <b>Time left</b>: {Math.max(0, finalScore.timeLeft || 0)}s
                  </div>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
                <button className="secondaryBtn" type="button" onClick={() => setStep("setup")}>
                  Try again
                </button>
                <button className="primaryBtn" type="button" onClick={close}>
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
