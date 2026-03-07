"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import D2LifeOrb from "@/components/D2LifeOrb";
import D2EnemyHealthBar from "@/components/D2EnemyHealthBar";
import DomainRuneBar from "@/components/DomainRuneBar";
import { getActiveUser } from "@/lib/userStore";
import { useCombatQuiz } from "@/engine/useCombatQuiz";
import type { CombatQuestion } from "@/engine/CombatQuizEngine";

export type DiabloQuestion = {
  id?: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation?: string | null;
  domainId?: string;
  level?: 1 | 2 | 3;
};

function labelForDomain(domainId: string) {
  const d = (domainId || "general").toLowerCase();
  if (d === "identity") return "Identity";
  if (d === "networking") return "Networking";
  if (d === "security") return "Security";
  if (d === "windows") return "Windows";
  return d.replace(/_/g, " ").slice(0, 18);
}

export default function DiabloQuizRunner(props: {
  title: string;
  subtitle?: string;
  enemyName?: string;
  questions: DiabloQuestion[];
  metaLeft?: string;
  metaRight?: string;
  forceFinish?: boolean;
  exitHref?: string;
  exitLabel?: string;
}) {
  const {
    title,
    subtitle,
    enemyName = "Lagger",
    questions,
    metaLeft,
    metaRight,
    forceFinish,
    exitHref = "/dashboard",
    exitLabel = "Close",
  } = props;

  const combatQuestions: CombatQuestion[] = useMemo(() => {
    return questions.map((q, i) => ({
      id: q.id || `q_${i}`,
      prompt: q.prompt,
      choices: q.choices,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      domainId: q.domainId,
      level: q.level,
    }));
  }, [questions]);

  const [hitPulse, setHitPulse] = useState<null | "player" | "enemy">(null);

  const { state, question, select, clear, submit, next, reset, currentDomainId, currentMastery, outcome } = useCombatQuiz({
    questions: combatQuestions,
    timed: false,
    onSubmit: (r) => {
      setHitPulse(r.correct ? "enemy" : "player");
      window.setTimeout(() => setHitPulse(null), 240);
    },
  });

  const playerName = useMemo(() => {
    try {
      const u = getActiveUser();
      return (u?.displayName || "Player").toUpperCase().slice(0, 18);
    } catch {
      return "PLAYER";
    }
  }, []);

  const domainLabel = labelForDomain(currentDomainId);

  const finished = Boolean(forceFinish) || state.finished;

  return (
    <div className="modalShell" style={{ position: "relative" }}>
      <div className="modalHead">
        <div>
          <div className="modalTitle d2Roman">{title}</div>
          {subtitle ? <div className="muted">{subtitle}</div> : null}
        </div>
        <Link className="btn" href={exitHref}>
          {exitLabel}
        </Link>
      </div>

      <div className="modalBody">
        <div className="d2InterviewGrid">
          <div className={hitPulse === "player" ? "d2Shake" : ""}>
            <D2LifeOrb value={state.playerHP} name={playerName} />
          </div>

          <div className={"d2QuestionCard " + (hitPulse === "enemy" ? "d2HitFlash" : "")}>
            <span className="d2Rivet" style={{ left: 12, top: 12 }} />
            <span className="d2Rivet" style={{ right: 12, top: 12 }} />
            <span className="d2Rivet" style={{ left: 12, bottom: 12 }} />
            <span className="d2Rivet" style={{ right: 12, bottom: 12 }} />

            {!finished && question ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div style={{ fontWeight: 900, letterSpacing: 0.6, opacity: 0.9 }}>
                    Q{state.idx + 1} / {combatQuestions.length}
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    {metaLeft ? <span className="badge">{metaLeft}</span> : null}
                    {metaRight ? <span className="badge">{metaRight}</span> : null}
                    <span className="badge">XP +{state.xpEarned}</span>
                  </div>
                </div>

                <div style={{ marginTop: 12, fontSize: 18, fontWeight: 900 }}>{question.prompt}</div>

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
              </>
            ) : (
              <div style={{ padding: 8 }}>
                <div className="d2Roman" style={{ fontSize: 18, letterSpacing: 1.2, marginBottom: 6 }}>
                  {outcome === "victory" ? "VICTORY" : outcome === "defeat" ? "DEFEAT" : "RUN COMPLETE"}
                </div>
                <div className="muted" style={{ marginBottom: 14 }}>
                  Score: {state.correctCount}/{combatQuestions.length} • XP +{state.xpEarned}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="d2Btn" onClick={() => reset()}>
                    Retry
                  </button>
                  <Link className="d2Btn" href={exitHref}>
                    Exit
                  </Link>
                </div>
              </div>
            )}
          </div>

          <div className={hitPulse === "enemy" ? "d2Shake" : ""}>
            <D2EnemyHealthBar name={enemyName.toUpperCase()} value={state.enemyHP} />
            <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>
              Right answers damage the enemy • Wrong answers damage you
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
