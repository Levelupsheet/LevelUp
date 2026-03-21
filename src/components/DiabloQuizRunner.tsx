"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import D2LifeOrb from "@/components/D2LifeOrb";
import D2EnemyHealthBar from "@/components/D2EnemyHealthBar";
import DomainRuneBar from "@/components/DomainRuneBar";
import { getActiveUser } from "@/lib/userStore";
import { useCombatQuiz } from "@/engine/useCombatQuiz";
import type { CombatQuestion, DifficultyTier } from "@/engine/CombatQuizEngine";
import {
  normalizeQuestionType,
  safeArray,
  uniqueSortedNumbers,
  type QuestionData,
  type QuestionType,
} from "@/lib/questionTypes";
import { evaluateQuestionAnswer } from "@/lib/questionTransforms";

export type DiabloQuestion = {
  id?: string;
  sessionQuestionId?: string;
  isGolden?: boolean;
  prompt: string;
  type?: QuestionType;
  choices?: string[];
  correctIndex?: number | null;
  data?: QuestionData | null;
  explanation?: string | null;
  domainId?: string;
  level?: DifficultyTier;
};

export type DiabloQuizRunSummary = {
  outcome: "victory" | "defeat" | "complete" | null;
  xpEarned: number;
  correctCount: number;
  totalQuestions: number;
  playerHP: number;
  enemyHP: number;
  timeLeft: number;
  masteryByDomain?: Record<string, number>;
  domainStatsByDomain?: Record<string, { correctCount: number; wrongCount: number; currentDifficulty: number }>;
};

export type QuizMediaConfig = {
  playerIdleSrc?: string;
  playerAttackSrc?: string;
  playerHitSrc?: string;
  enemyIdleSrc?: string;
  enemyHitSrc?: string;
  width?: number;
  height?: number;
};

function labelForDomain(domainId: string) {
  const d = (domainId || "general").toLowerCase();
  if (d === "identity") return "Identity";
  if (d === "networking") return "Networking";
  if (d === "security") return "Security";
  if (d === "windows") return "Windows";
  return d.replace(/_/g, " ").slice(0, 18);
}

function labelForType(type: QuestionType) {
  if (type === "multiple_choice") return "Multiple Choice";
  if (type === "fill_blank") return "Fill in the Blank";
  if (type === "sequence_order") return "Sequence Order";
  if (type === "multi_select") return "Multi Select";
  if (type === "incident") return "Incident";
  if (type === "cli_command") return "CLI Command";
  if (type === "log_analysis") return "Log Analysis";
  return "Question";
}

function ModelPanel(props: { title: string; src?: string; mirrored?: boolean; loop?: boolean; onEnded?: () => void; height?: number | string }) {
  const { title, src, mirrored = false, loop = true, onEnded, height = 230 } = props;
  return (
    <div className="card" style={{ padding: 10, background: "rgba(255,255,255,0.04)", minHeight: 250 }}>
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.6, opacity: 0.88, marginBottom: 8 }}>{title}</div>
      <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(5,10,20,0.85)" }}>
        {src ? (
          <video
            key={src}
            autoPlay
            loop={loop}
            muted
            playsInline
            preload="metadata"
            onEnded={onEnded}
            style={{ display: "block", width: "100%", height, objectFit: "cover", transform: mirrored ? "scaleX(-1)" : undefined }}
          >
            <source src={src} type="video/mp4" />
          </video>
        ) : (
          <div style={{ height, display: "grid", placeItems: "center", opacity: 0.7 }}>Video slot ready</div>
        )}
      </div>
    </div>
  );
}

function reorderItem(items: string[], from: number, to: number) {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function renderQuestionInput(args: {
  question: CombatQuestion;
  state: ReturnType<typeof useCombatQuiz>["state"];
  mcqSelected: number | null;
  onSelectMcq: (index: number) => void;
  fillValue: string;
  setFillValue: (value: string) => void;
  cliValue: string;
  setCliValue: (value: string) => void;
  logValue: string;
  setLogValue: (value: string) => void;
  sequenceItems: string[];
  moveSequenceItem: (from: number, to: number) => void;
  multiSelected: number[];
  toggleMultiSelected: (index: number) => void;
}) {
  const {
    question,
    state,
    mcqSelected,
    onSelectMcq,
    fillValue,
    setFillValue,
    cliValue,
    setCliValue,
    logValue,
    setLogValue,
    sequenceItems,
    moveSequenceItem,
    multiSelected,
    toggleMultiSelected,
  } = args;

  const type = normalizeQuestionType(question.type);
  const data = (question.data || {}) as Record<string, unknown>;

  if (type === "multiple_choice" || type === "incident") {
    const choices = safeArray<string>(question.choices?.length ? question.choices : data.choices);
    const correctIndex = Number(question.correctIndex ?? data.correctIndex ?? -1);
    return (
      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        {type === "incident" && data.scenario ? (
          <div className="card" style={{ padding: 12, background: "rgba(255,255,255,0.04)", whiteSpace: "pre-wrap" }}>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.6, opacity: 0.8, marginBottom: 8 }}>INCIDENT DETAILS</div>
            <div className="muted">{String(data.scenario)}</div>
          </div>
        ) : null}
        {choices.map((choice, index) => {
          const isSel = mcqSelected === index;
          const isOk = state.locked && index === correctIndex;
          const isBad = state.locked && isSel && index !== correctIndex;
          const extraStyle: React.CSSProperties = {};
          if (isOk) extraStyle.borderColor = "rgba(46, 204, 113, 0.55)";
          if (isBad) extraStyle.borderColor = "rgba(255, 90, 90, 0.55)";
          return (
            <button
              key={index}
              type="button"
              className={"d2ChoiceBtn" + (isSel ? " selected" : "")}
              onClick={() => onSelectMcq(index)}
              disabled={state.locked}
              style={extraStyle}
            >
              {choice}
            </button>
          );
        })}
      </div>
    );
  }

  if (type === "fill_blank") {
    return (
      <div style={{ marginTop: 14 }}>
        <input
          value={fillValue}
          onChange={(e) => setFillValue(e.target.value)}
          disabled={state.locked}
          placeholder={String(data.placeholder || "Type your answer")}
          className="input"
          style={{ width: "100%", minHeight: 50 }}
        />
      </div>
    );
  }

  if (type === "cli_command") {
    return (
      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        {data.hint ? <div className="badge">Hint: {String(data.hint)}</div> : null}
        <textarea
          value={cliValue}
          onChange={(e) => setCliValue(e.target.value)}
          disabled={state.locked}
          placeholder={String(data.placeholder || "Enter the command")}
          className="input"
          style={{ width: "100%", minHeight: 120, resize: "vertical", fontFamily: "monospace" }}
        />
      </div>
    );
  }

  if (type === "log_analysis") {
    return (
      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        {data.logText ? (
          <div className="card" style={{ padding: 12, background: "rgba(255,255,255,0.04)", whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 13 }}>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.6, opacity: 0.8, marginBottom: 8 }}>LOG EXCERPT</div>
            <div>{String(data.logText)}</div>
          </div>
        ) : null}
        <textarea value={logValue} onChange={(e) => setLogValue(e.target.value)} disabled={state.locked} placeholder={String(data.placeholder || "Describe the issue shown in the log")} className="input" style={{ width: "100%", minHeight: 120, resize: "vertical" }} />
      </div>
    );
  }

  if (type === "sequence_order") {
    return (
      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        {data.instructions ? <div className="badge">{String(data.instructions)}</div> : null}
        {sequenceItems.map((item, index) => (
          <div key={`${item}_${index}`} className="card" style={{ padding: 10, background: "rgba(255,255,255,0.04)", display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ fontWeight: 900, minWidth: 28 }}>{index + 1}.</div>
            <div style={{ flex: 1 }}>{item}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="d2Btn" disabled={state.locked || index === 0} onClick={() => moveSequenceItem(index, index - 1)}>UP</button>
              <button type="button" className="d2Btn" disabled={state.locked || index === sequenceItems.length - 1} onClick={() => moveSequenceItem(index, index + 1)}>DOWN</button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "multi_select") {
    const choices = safeArray<string>(data.choices);
    const correctIndices = uniqueSortedNumbers(data.correctIndices);
    return (
      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        <div className="badge">Select all that apply{correctIndices.length ? ` (${correctIndices.length})` : ""}</div>
        {choices.map((choice, index) => {
          const checked = multiSelected.includes(index);
          const isOk = state.locked && correctIndices.includes(index);
          const isBad = state.locked && checked && !correctIndices.includes(index);
          return (
            <label
              key={index}
              className="card"
              style={{
                padding: 12,
                display: "flex",
                gap: 10,
                alignItems: "center",
                background: "rgba(255,255,255,0.04)",
                border: isOk
                  ? "1px solid rgba(46, 204, 113, 0.55)"
                  : isBad
                    ? "1px solid rgba(255, 90, 90, 0.55)"
                    : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <input type="checkbox" checked={checked} disabled={state.locked} onChange={() => toggleMultiSelected(index)} />
              <span>{choice}</span>
            </label>
          );
        })}
      </div>
    );
  }

  return <div className="muted" style={{ marginTop: 14 }}>Unsupported question type.</div>;
}

export default function DiabloQuizRunner(props: {
  title: string;
  subtitle?: string;
  enemyName?: string;
  questions: DiabloQuestion[];
  timed?: boolean;
  metaLeft?: string;
  metaRight?: string;
  forceFinish?: boolean;
  exitHref?: string;
  exitLabel?: string;
  onExit?: () => void;
  onComplete?: (summary: DiabloQuizRunSummary) => void;
  onXp?: (xpDelta: number, totalXp: number) => void;
  initialState?: any;
  onStateChange?: (state: any) => void;
  onQuestionAdvanced?: (payload: { sessionQuestionId?: string; questionId?: string; isCorrect: boolean; isGolden: boolean; domainId?: string; level?: DifficultyTier }) => void;
  media?: QuizMediaConfig;
}) {
  const {
    title,
    subtitle,
    enemyName = "Lagger",
    questions,
    timed = false,
    metaLeft,
    metaRight,
    forceFinish,
    exitHref = "/dashboard",
    exitLabel = "Close",
    onExit,
    onComplete,
    onXp,
    initialState,
    onStateChange,
    onQuestionAdvanced,
    media,
  } = props;

  const combatQuestions: CombatQuestion[] = useMemo(
    () =>
      questions.map((q, i) => ({
        id: q.id || `q_${i}`,
        prompt: q.prompt,
        type: normalizeQuestionType(q.type),
        choices: q.choices,
        correctIndex: typeof q.correctIndex === "number" ? q.correctIndex : null,
        data: q.data,
        explanation: q.explanation,
        domainId: q.domainId,
        level: q.level,
      })),
    [questions]
  );

  const [hitPulse, setHitPulse] = useState<null | "player" | "enemy">(null);
  const domainStatsRef = useRef<Record<string, { correctCount: number; wrongCount: number; currentDifficulty: number }>>({});
  const [fillValue, setFillValue] = useState("");
  const [cliValue, setCliValue] = useState("");
  const [logValue, setLogValue] = useState("");
  const [sequenceItems, setSequenceItems] = useState<string[]>([]);
  const [multiSelected, setMultiSelected] = useState<number[]>([]);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const finishedOnceRef = useRef(false);

  const { state, question, select, clear, submit, submitManual, next, currentDomainId, currentMastery, outcome } = useCombatQuiz({
    questions: combatQuestions,
    timed,
    onXp,
    onSubmit: (r) => {
      const domainKey = String(r.domainId || "general").toLowerCase();
      const current = domainStatsRef.current[domainKey] || { correctCount: 0, wrongCount: 0, currentDifficulty: 1 };
      if (r.correct) current.correctCount += 1;
      else current.wrongCount += 1;
      current.currentDifficulty = Math.max(current.currentDifficulty || 1, Number(r.tier || 1));
      domainStatsRef.current[domainKey] = current;
      setHitPulse(r.correct ? "enemy" : "player");
      if ((r.correct && !media?.enemyHitSrc) || (!r.correct && !media?.playerHitSrc)) {
        window.setTimeout(() => setHitPulse(null), 900);
      }
    },
    initialState,
    onStateChange,
  });

  const questionType = normalizeQuestionType(question?.type);
  const usesManualSubmit = questionType !== "multiple_choice" && questionType !== "incident";

  useEffect(() => {
    finishedOnceRef.current = false;
    domainStatsRef.current = {};
  }, [combatQuestions.length, timed, title]);

  useEffect(() => {
    const apply = () => setIsMobileLayout(window.innerWidth < 860);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  useEffect(() => {
    const data = (question?.data || {}) as Record<string, unknown>;
    setFillValue("");
    setCliValue("");
    setLogValue("");
    setMultiSelected([]);
    if (questionType === "sequence_order") {
      const items = safeArray<string>(data.items);
      const correctOrder = safeArray<string>(data.correctOrder);
      setSequenceItems(items.length ? items : correctOrder);
    } else {
      setSequenceItems([]);
    }
  }, [question?.id, questionType]);

  useEffect(() => {
    if (!state.finished || finishedOnceRef.current) return;
    finishedOnceRef.current = true;
    onComplete?.({
      outcome: outcome as DiabloQuizRunSummary['outcome'],
      xpEarned: state.xpEarned,
      correctCount: state.correctCount,
      totalQuestions: combatQuestions.length,
      playerHP: state.playerHP,
      enemyHP: state.enemyHP,
      timeLeft: state.timeLeft,
      masteryByDomain: state.mastery,
      domainStatsByDomain: domainStatsRef.current,
    });
  }, [state.finished, state.xpEarned, state.correctCount, state.playerHP, state.enemyHP, state.timeLeft, combatQuestions.length, onComplete, outcome]);

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
  const isGoldenQuestion = Boolean(question && (question as any).isGolden);

  function handleNextQuestion() {
    if (question && state.locked) {
      onQuestionAdvanced?.({
        sessionQuestionId: (question as any).sessionQuestionId,
        questionId: String(question.id || ""),
        isCorrect: Boolean(state.lastWasCorrect),
        isGolden: Boolean((question as any).isGolden),
        domainId: question.domainId,
        level: question.level,
      });
    }
    next();
  }

  const isEnemyHitVideo = hitPulse === "enemy" && Boolean(media?.enemyHitSrc);
  const isPlayerHitVideo = hitPulse === "player" && Boolean(media?.playerHitSrc);
  const playerVideo = hitPulse === "enemy" ? media?.playerAttackSrc || media?.playerIdleSrc : hitPulse === "player" ? media?.playerHitSrc || media?.playerIdleSrc : media?.playerIdleSrc;
  const enemyVideo = hitPulse === "enemy" ? media?.enemyHitSrc || media?.enemyIdleSrc : media?.enemyIdleSrc;

  function handleManualSubmit() {
    if (!question || state.locked) return;
    let answer: unknown = null;
    if (questionType === "fill_blank") answer = fillValue;
    if (questionType === "sequence_order") answer = sequenceItems;
    if (questionType === "multi_select") answer = multiSelected;
    if (questionType === "cli_command") answer = cliValue;
    if (questionType === "log_analysis") answer = logValue;

    const result = evaluateQuestionAnswer({
      type: question.type,
      prompt: question.prompt,
      correctIndex: question.correctIndex,
      choices: question.choices,
      data: question.data,
      answer,
    });

    submitManual({
      correct: result.correct,
      domainId: question.domainId,
      level: question.level,
      feedback: result.correct ? question.explanation || null : result.feedback || question.explanation || null,
    });
  }

  function canSubmitCurrentQuestion() {
    if (!question || state.locked) return false;
    if (!usesManualSubmit) return state.selected != null;
    if (questionType === "fill_blank") return fillValue.trim().length > 0;
    if (questionType === "sequence_order") return sequenceItems.length > 0;
    if (questionType === "multi_select") return multiSelected.length > 0;
    if (questionType === "cli_command") return cliValue.trim().length > 0;
    if (questionType === "log_analysis") return logValue.trim().length > 0;
    return false;
  }

  return (
    <div
      className="modalShell d2QuizShell"
      style={{ position: "relative", width: "min(96vw, 1800px)", maxWidth: media?.width || 1600, minHeight: "min(860px, calc(100dvh - 48px))", margin: "0 auto" }}
    >
      <div className="modalHead">
        <div>
          <div className="modalTitle d2Roman">{title}</div>
          {subtitle ? <div className="muted">{subtitle}</div> : null}
        </div>
        {onExit ? (
          <button className="btn" type="button" onClick={onExit}>{exitLabel}</button>
        ) : (
          <Link className="btn" href={exitHref}>{exitLabel}</Link>
        )}
      </div>

      <div className="modalBody d2QuizBody">
        {!isMobileLayout ? (
          <div className="d2InterviewGrid d2QuizGrid">
            <div style={{ display: "grid", gap: 12 }}>
              <div className={hitPulse === "player" ? "d2Shake" : ""}>
                <D2LifeOrb value={state.playerHP} name={playerName} />
              </div>
              <ModelPanel title={playerName} src={playerVideo} loop={!isPlayerHitVideo} onEnded={isPlayerHitVideo ? () => setHitPulse(null) : undefined} height="clamp(260px, 30vh, 420px)" />
            </div>

            <div className={"d2QuestionCard d2QuizQuestionCard " + (hitPulse === "enemy" ? "d2HitFlash" : "") + (isGoldenQuestion ? " d2GoldenQuestion" : "") } style={{ minHeight: 560, border: isGoldenQuestion ? "1px solid rgba(245, 197, 66, 0.75)" : undefined, boxShadow: isGoldenQuestion ? "0 0 0 1px rgba(245,197,66,.22), 0 0 26px rgba(245,197,66,.18), inset 0 0 32px rgba(245,197,66,.08)" : undefined }}>
              <span className="d2Rivet" style={{ left: 12, top: 12 }} />
              <span className="d2Rivet" style={{ right: 12, top: 12 }} />
              <span className="d2Rivet" style={{ left: 12, bottom: 12 }} />
              <span className="d2Rivet" style={{ right: 12, bottom: 12 }} />

              {!finished && question ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 900, letterSpacing: 0.6, opacity: 0.9 }}>
                      Q{state.idx + 1} / {combatQuestions.length}
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {metaLeft ? <span className="badge">{metaLeft}</span> : null}
                      {timed ? <span className="badge" style={{ fontVariantNumeric: "tabular-nums" }}>⏱ {Math.max(0, state.timeLeft)}s</span> : null}
                      <span className="badge">{labelForType(questionType)}</span>
                      {metaRight ? <span className="badge">{metaRight}</span> : null}
                      {isGoldenQuestion ? <span className="badge" style={{ borderColor: "rgba(245,197,66,.55)", color: "#fcd34d", boxShadow: "0 0 18px rgba(245,197,66,.16)" }}>Golden Draw Question</span> : null}
                      <span className="badge">XP +{state.xpEarned}</span>
                    </div>
                  </div>

                  <div style={{ marginTop: 12, fontSize: 22, lineHeight: 1.35, fontWeight: 900 }}>{question.prompt}</div>

                  <DomainRuneBar domainLabel={domainLabel} mastery={currentMastery} tier={state.tier} />

                  {renderQuestionInput({
                    question,
                    state,
                    mcqSelected: state.selected,
                    onSelectMcq: select,
                    fillValue,
                    setFillValue,
                    cliValue,
                    setCliValue,
                    logValue,
                    setLogValue,
                    sequenceItems,
                    moveSequenceItem: (from, to) => setSequenceItems((current) => reorderItem(current, from, to)),
                    multiSelected,
                    toggleMultiSelected: (index) => {
                      setMultiSelected((current) => current.includes(index) ? current.filter((v) => v !== index) : [...current, index].sort((a, b) => a - b));
                    },
                  })}

                  <div className="d2ActionRow" style={{ marginTop: 14 }}>
                    {!state.locked ? (
                      <>
                        <button className="d2Btn" onClick={() => (usesManualSubmit ? handleManualSubmit() : submit())} disabled={!canSubmitCurrentQuestion()}>SUBMIT</button>
                        <button
                          className="d2Btn"
                          onClick={() => {
                            clear();
                            setFillValue("");
                            setCliValue("");
                            setLogValue("");
                            setMultiSelected([]);
                            const data = (question.data || {}) as Record<string, unknown>;
                            const items = safeArray<string>(data.items);
                            const correctOrder = safeArray<string>(data.correctOrder);
                            setSequenceItems(items.length ? items : correctOrder);
                          }}
                        >
                          CLEAR
                        </button>
                      </>
                    ) : (
                      <button className="d2Btn" onClick={() => handleNextQuestion()}>NEXT</button>
                    )}
                  </div>

                  {state.locked && (
                    <div style={{ marginTop: 12 }}>
                      <div className="card" style={{ padding: 12, background: "rgba(255,255,255,0.04)" }}>
                        <div style={{ fontWeight: 950 }}>{state.lastWasCorrect ? "✅ Correct" : "❌ Not quite"}</div>
                        <div className="muted" style={{ marginTop: 6 }}>{state.feedback || "Review the explanation and continue."}</div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="card" style={{ padding: 16, background: "rgba(255,255,255,0.04)" }}>
                  <div style={{ fontWeight: 950, fontSize: 20 }}>{outcome === "victory" ? "Victory" : outcome === "defeat" ? "Defeat" : "Run complete"}</div>
                  <div className="muted" style={{ marginTop: 8 }}>Score {state.correctCount}/{combatQuestions.length} • XP +{state.xpEarned}</div>
                </div>
              )}
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <D2EnemyHealthBar value={state.enemyHP} name={enemyName.toUpperCase().slice(0, 18)} />
              <ModelPanel title={enemyName.toUpperCase().slice(0, 18)} src={enemyVideo} mirrored loop={!isEnemyHitVideo} onEnded={isEnemyHitVideo ? () => setHitPulse(null) : undefined} height="clamp(260px, 30vh, 420px)" />
            </div>
          </div>
        ) : (
          <div className="mobileQuizStack">
            <div className="mobileQuizTopMeta">
              <div className="mobileQuizProgress">Q{Math.min(state.idx + 1, combatQuestions.length)} / {combatQuestions.length}</div>
              <div className="mobileQuizBadges">
                {timed ? <span className="badge" style={{ fontVariantNumeric: "tabular-nums" }}>⏱ {Math.max(0, state.timeLeft)}s</span> : null}
                <span className="badge">XP +{state.xpEarned}</span>
              </div>
            </div>

            <div className="mobileCombatCard">
              <D2EnemyHealthBar value={state.enemyHP} name={enemyName.toUpperCase().slice(0, 18)} />
              <div style={{ marginTop: 10 }}>
                <ModelPanel title={enemyName.toUpperCase().slice(0, 18)} src={enemyVideo} mirrored loop={!isEnemyHitVideo} onEnded={isEnemyHitVideo ? () => setHitPulse(null) : undefined} height={230} />
              </div>
            </div>

            <div className={"d2QuestionCard d2QuizQuestionCard mobileQuizQuestionCard " + (hitPulse === "enemy" ? "d2HitFlash" : "") + (isGoldenQuestion ? " d2GoldenQuestion" : "")} style={{ border: isGoldenQuestion ? "1px solid rgba(245, 197, 66, 0.75)" : undefined, boxShadow: isGoldenQuestion ? "0 0 0 1px rgba(245,197,66,.22), 0 0 24px rgba(245,197,66,.18), inset 0 0 30px rgba(245,197,66,.08)" : undefined }}>
              {!finished && question ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <span className="badge">{labelForType(questionType)}</span>
                    <span className="badge">Tier {state.tier}</span>
                    {isGoldenQuestion ? <span className="badge" style={{ borderColor: "rgba(245,197,66,.55)", color: "#fcd34d", boxShadow: "0 0 18px rgba(245,197,66,.16)" }}>Golden Draw Question</span> : null}
                  </div>
                  <div className="mobileQuizPrompt">{question.prompt}</div>
                  <DomainRuneBar domainLabel={domainLabel} mastery={currentMastery} tier={state.tier} />
                  {renderQuestionInput({
                    question,
                    state,
                    mcqSelected: state.selected,
                    onSelectMcq: select,
                    fillValue,
                    setFillValue,
                    cliValue,
                    setCliValue,
                    logValue,
                    setLogValue,
                    sequenceItems,
                    moveSequenceItem: (from, to) => setSequenceItems((current) => reorderItem(current, from, to)),
                    multiSelected,
                    toggleMultiSelected: (index) => {
                      setMultiSelected((current) => current.includes(index) ? current.filter((v) => v !== index) : [...current, index].sort((a, b) => a - b));
                    },
                  })}

                  <div className="d2ActionRow mobileQuizActions" style={{ marginTop: 14 }}>
                    {!state.locked ? (
                      <>
                        <button className="d2Btn" onClick={() => (usesManualSubmit ? handleManualSubmit() : submit())} disabled={!canSubmitCurrentQuestion()}>SUBMIT</button>
                        <button
                          className="d2Btn"
                          onClick={() => {
                            clear();
                            setFillValue("");
                            setCliValue("");
                            setLogValue("");
                            setMultiSelected([]);
                            const data = (question.data || {}) as Record<string, unknown>;
                            const items = safeArray<string>(data.items);
                            const correctOrder = safeArray<string>(data.correctOrder);
                            setSequenceItems(items.length ? items : correctOrder);
                          }}
                        >
                          CLEAR
                        </button>
                      </>
                    ) : (
                      <button className="d2Btn" onClick={() => handleNextQuestion()}>NEXT</button>
                    )}
                  </div>
                  {state.locked && (
                    <div style={{ marginTop: 12 }}>
                      <div className="card" style={{ padding: 12, background: "rgba(255,255,255,0.04)" }}>
                        <div style={{ fontWeight: 950 }}>{state.lastWasCorrect ? "✅ Correct" : "❌ Not quite"}</div>
                        <div className="muted" style={{ marginTop: 6 }}>{state.feedback || "Review the explanation and continue."}</div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="card" style={{ padding: 16, background: "rgba(255,255,255,0.04)" }}>
                  <div style={{ fontWeight: 950, fontSize: 20 }}>{outcome === "victory" ? "Victory" : outcome === "defeat" ? "Defeat" : "Run complete"}</div>
                  <div className="muted" style={{ marginTop: 8 }}>Score {state.correctCount}/{combatQuestions.length} • XP +{state.xpEarned}</div>
                </div>
              )}
            </div>

            <div className="mobileCombatCard">
              <div className={hitPulse === "player" ? "d2Shake" : ""}>
                <D2LifeOrb value={state.playerHP} name={playerName} />
              </div>
              <div style={{ marginTop: 10 }}>
                <ModelPanel title={playerName} src={playerVideo} loop={!isPlayerHitVideo} onEnded={isPlayerHitVideo ? () => setHitPulse(null) : undefined} height="clamp(260px, 30vh, 420px)" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
