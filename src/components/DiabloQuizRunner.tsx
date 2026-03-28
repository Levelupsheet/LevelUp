"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import D2LifeOrb from "@/components/D2LifeOrb";
import D2EnemyHealthBar from "@/components/D2EnemyHealthBar";
import DomainRuneBar from "@/components/DomainRuneBar";
import { getActiveUser } from "@/lib/userStore";
import { resolveClientUserId } from "@/lib/activeUser";
import { useCombatQuiz } from "@/engine/useCombatQuiz";
import type { CombatQuestion, DifficultyTier } from "@/engine/CombatQuizEngine";
import {
  normalizeQuestionType,
  normalizeText,
  safeArray,
  uniqueSortedNumbers,
  type QuestionData,
  type QuestionType,
} from "@/lib/questionTypes";
import { evaluateQuestionAnswer } from "@/lib/questionTransforms";
import { domainHintLabel, getHintCost, partialExplanation, removableIncorrectIndices, type HintType } from "@/lib/hints";
import { detectFatigue, getDynamicDifficulty, getMicroReward, getSessionMomentum, type Stage8Fatigue, type Stage8QuestionResult } from "@/engine/stage8/RetentionSystem";

export type DiabloQuestion = {
  id?: string;
  prompt: string;
  type?: QuestionType;
  choices?: string[];
  correctIndex?: number | null;
  data?: QuestionData | null;
  explanation?: string | null;
  domainId?: string;
  level?: DifficultyTier;
  sessionQuestionId?: string;
  isGolden?: boolean;
};

export type DiabloQuizRunSummary = {
  outcome: "victory" | "defeat" | "complete" | null;
  xpEarned: number;
  rawXpEarned?: number;
  hintXpSpent?: number;
  hintsUsedCount?: number;
  correctCount: number;
  totalQuestions: number;
  playerHP: number;
  enemyHP: number;
  timeLeft: number;
  masteryByDomain?: Record<string, number>;
  bestStreak?: number;
  bossEligible?: boolean;
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
  if (type === "true_false") return "True / False";
  if (type === "matching") return "Matching";
  return "Question";
}

function inferMaxStages(title: string, totalQuestions: number) {
  const upper = String(title || "").toUpperCase();
  if (upper.includes("TEST NOW")) return 5;
  if (upper.includes("POSITION TRAINING") || upper.includes("PRACTICE") || upper.includes("CERT")) return 4;
  return Math.max(1, Math.min(5, Math.ceil(totalQuestions / 3)));
}

function stageEnemyName(base: string, stage: number, maxStages: number, encounterType: "standard" | "boss") {
  if (encounterType === "boss" && stage >= maxStages) return `Golden ${base}`;
  return `${base}`;
}

type StageConfig = { name: string; hp: number; playerDamage: number; healChance: number; healMin: number; healMax: number };

function buildStageConfigs(title: string, maxStages: number, encounterType: "standard" | "boss") : StageConfig[] {
  const upper = String(title || "").toUpperCase();
  const boss = encounterType === "boss";
  const trainingNames = ["Ticket Gremlin", "Patch Warden", "Queue Tyrant", "System Reaper", "Golden Overseer"];
  const certNames = ["Exam Shade", "Concept Warden", "Cipher Beast", "Proctor Revenant", "Golden Examiner"];
  const testNames = ["Lagger", "Firewall Sentinel", "Identity Warden", "Cloud Tyrant", "Golden Boss"];
  const baseNames = upper.includes("CERT") ? certNames : upper.includes("TEST NOW") ? testNames : trainingNames;
  return Array.from({ length: maxStages }).map((_, idx) => {
    const stage = idx + 1;
    return {
      name: boss && stage === maxStages ? `Golden ${baseNames[Math.min(idx, baseNames.length - 1)]}` : baseNames[Math.min(idx, baseNames.length - 1)],
      hp: 90 + idx * 20 + (boss ? 25 : 0),
      playerDamage: 8 + idx * 4 + (boss ? 2 : 0),
      healChance: Math.max(0.12, 0.28 - idx * 0.03),
      healMin: 4,
      healMax: 8 + idx,
    };
  });
}

function ModelPanel(props: { title: string; src?: string; mirrored?: boolean; loop?: boolean; onEnded?: () => void; height?: number | string; damageText?: string | null; damageTone?: "enemy" | "player" | null }) {
  const { title, src, mirrored = false, loop = true, onEnded, height = 230, damageText, damageTone } = props;
  return (
    <div className="card" style={{ padding: 10, background: "rgba(255,255,255,0.04)", minHeight: 250 }}>
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.6, opacity: 0.88, marginBottom: 8 }}>{title}</div>
      <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(5,10,20,0.85)" }}>
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
        {damageText ? <div className={"d2DamageFloat " + (damageTone === "enemy" ? "enemy" : "player")}>{damageText}</div> : null}
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

type Stage7PowerupState = {
  shieldActive: boolean;
  furyActive: boolean;
  shieldUses: number;
  furyUses: number;
};

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
  matchingSelections: string[];
  setMatchingSelection: (index: number, value: string) => void;
  hiddenChoiceIndices: number[];
  commandHistory: string[];
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
    matchingSelections,
    setMatchingSelection,
    hiddenChoiceIndices,
    commandHistory,
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
          if (hiddenChoiceIndices.includes(index)) return null;
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

  if (type === "true_false") {
    const choices = ["True", "False"];
    const correctIndex = Number((data as any).correctIndex ?? question.correctIndex ?? 0);
    return (
      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        {choices.map((choice, index) => {
          if (hiddenChoiceIndices.includes(index)) return null;
          const isSel = mcqSelected === index;
          const isOk = state.locked && index === correctIndex;
          const isBad = state.locked && isSel && index !== correctIndex;
          return (
            <button
              key={choice}
              type="button"
              className={"d2ChoiceBtn" + (isSel ? " selected" : "")}
              onClick={() => onSelectMcq(index)}
              disabled={state.locked}
              style={{
                borderColor: isOk ? "rgba(46, 204, 113, 0.55)" : isBad ? "rgba(255, 90, 90, 0.55)" : undefined,
              }}
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
    const commandSuggestions = Array.from(new Set([
      ...safeArray<string>((data as any).expectedCommands),
      ...safeArray<string>((data as any).distractorCommands),
      ...commandHistory,
    ].filter(Boolean))).slice(0, 6);
    return (
      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        {data.hint ? <div className="badge">Hint: {String(data.hint)}</div> : null}
        <div className="card" style={{ padding: 12, background: "rgba(4,8,18,0.78)", borderColor: "rgba(110,190,255,0.20)" }}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.6, opacity: 0.8, marginBottom: 8 }}>COMMAND CONSOLE</div>
          <textarea
            value={cliValue}
            onChange={(e) => setCliValue(e.target.value)}
            disabled={state.locked}
            placeholder={String(data.placeholder || "Enter the command")}
            className="input"
            spellCheck={false}
            style={{ width: "100%", minHeight: 88, resize: "none", fontFamily: "monospace", background: "rgba(0,0,0,0.42)" }}
          />
          {commandSuggestions.length ? (
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {commandSuggestions.map((command) => {
                const selected = normalizeText(cliValue) === normalizeText(command);
                return (
                  <button
                    key={command}
                    type="button"
                    className="d2Btn"
                    disabled={state.locked}
                    onClick={() => setCliValue(command)}
                    style={{
                      fontFamily: "monospace",
                      fontSize: 12,
                      borderColor: selected ? "rgba(110,190,255,0.48)" : undefined,
                      background: selected ? "rgba(110,190,255,0.18)" : undefined,
                      boxShadow: selected ? "0 0 0 1px rgba(110,190,255,0.18) inset" : undefined,
                    }}
                  >
                    {command}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (type === "log_analysis") {
    const logChoices = safeArray<string>((data as any).choices);
    return (
      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        {data.logText ? (
          <div className="card" style={{ padding: 12, background: "rgba(255,255,255,0.04)", whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 13 }}>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.6, opacity: 0.8, marginBottom: 8 }}>LOG EXCERPT</div>
            <div>{String(data.logText)}</div>
          </div>
        ) : null}
        {logChoices.length ? (
          <div style={{ display: "grid", gap: 10 }}>
            {logChoices.map((choice, index) => {
              const isSel = mcqSelected === index;
              return (
                <button key={`${choice}_${index}`} type="button" className={"d2ChoiceBtn" + (isSel ? " selected" : "")} onClick={() => onSelectMcq(index)} disabled={state.locked}>
                  {choice}
                </button>
              );
            })}
          </div>
        ) : (
          <textarea value={logValue} onChange={(e) => setLogValue(e.target.value)} disabled={state.locked} placeholder={String(data.placeholder || "Describe the issue shown in the log")} className="input" style={{ width: "100%", minHeight: 88, resize: "none" }} />
        )}
      </div>
    );
  }

  if (type === "sequence_order") {
    return (
      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        {data.instructions ? <div className="badge">{String(data.instructions)}</div> : null}
        {sequenceItems.map((item, index) => (
          <div key={`${item}_${index}`} className="card d2CompactSequenceRow" style={{ padding: 8, background: "rgba(255,255,255,0.04)", display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ fontWeight: 900, minWidth: 28 }}>{index + 1}.</div>
            <div className="d2CompactSequenceText" style={{ flex: 1 }}>{item}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="d2Btn compact" disabled={state.locked || index === 0} onClick={() => moveSequenceItem(index, index - 1)}>UP</button>
              <button type="button" className="d2Btn compact" disabled={state.locked || index === sequenceItems.length - 1} onClick={() => moveSequenceItem(index, index + 1)}>DOWN</button>
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

  if (type === "matching") {
    const pairs = safeArray<any>((data as any).pairs)
      .map((pair) => ({ left: String(pair?.left || "").trim(), right: String(pair?.right || "").trim() }))
      .filter((pair) => pair.left && pair.right);
    const leftItems = safeArray<string>((data as any).leftItems).length
      ? safeArray<string>((data as any).leftItems)
      : pairs.map((pair) => pair.left);
    const rightItems = safeArray<string>((data as any).rightItems).length
      ? safeArray<string>((data as any).rightItems)
      : Array.from(new Set(pairs.map((pair) => pair.right)));
    const correctMatches = safeArray<string>((data as any).correctMatches).length
      ? safeArray<string>((data as any).correctMatches)
      : pairs.map((pair) => pair.right);

    return (
      <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
        {(data as any).instructions ? <div className="badge" style={{ whiteSpace: "normal", lineHeight: 1.4 }}>{String((data as any).instructions)}</div> : null}
        {leftItems.map((left, index) => {
          const selected = matchingSelections[index] || "";
          const isOk = state.locked && normalizeText(selected) === normalizeText(correctMatches[index]);
          const isBad = state.locked && Boolean(selected) && !isOk;
          return (
            <div
              key={`${left}_${index}`}
              className="card d2CompactMatchRow"
              style={{
                padding: 10,
                display: "grid",
                gridTemplateColumns: "minmax(140px, 1.1fr) minmax(160px, 0.9fr)",
                gap: 12,
                alignItems: "center",
                background: "rgba(255,255,255,0.04)",
                borderColor: isOk ? "rgba(46, 204, 113, 0.55)" : isBad ? "rgba(255, 90, 90, 0.55)" : undefined,
              }}
            >
              <div style={{ fontWeight: 700 }}>{left}</div>
              <select
                value={selected}
                disabled={state.locked}
                onChange={(e) => setMatchingSelection(index, e.target.value)}
                className="input"
                style={{ width: "100%" }}
              >
                <option value="">Select a match…</option>
                {rightItems.map((option, optionIndex) => (
                  <option key={`${option}_${optionIndex}`} value={option}>{option}</option>
                ))}
              </select>
            </div>
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
  onAdvanceQuestion?: (payload: { question: DiabloQuestion; isCorrect: boolean | null; selectedAnswer?: unknown; nextIndex: number; stateSnapshot?: any }) => Promise<{ goldenAwarded?: boolean } | void> | ({ goldenAwarded?: boolean } | void);
  media?: QuizMediaConfig;
  rules?: any;
  encounterType?: "standard" | "boss";
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
    onAdvanceQuestion,
    media,
    rules,
    encounterType = "standard",
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
        sessionQuestionId: (q as any).sessionQuestionId,
        isGolden: Boolean((q as any).isGolden),
      } as any)),
    [questions]
  );

  const [hitPulse, setHitPulse] = useState<null | "player" | "enemy">(null);
  const [fillValue, setFillValue] = useState("");
  const [cliValue, setCliValue] = useState("");
  const [logValue, setLogValue] = useState("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [sequenceItems, setSequenceItems] = useState<string[]>([]);
  const [multiSelected, setMultiSelected] = useState<number[]>([]);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [goldenEntryFlash, setGoldenEntryFlash] = useState<string | null>(null);

  // Newly added state to support hints and choice hiding/matching
  const [matchingSelections, setMatchingSelections] = useState<string[]>([]);
  const [hiddenChoiceIndices, setHiddenChoiceIndices] = useState<number[]>([]);
  const [hintMessage, setHintMessage] = useState<string | null>(null);
  const [hintXpSpent, setHintXpSpent] = useState<number>(0);
  const [hintsUsedCount, setHintsUsedCount] = useState<number>(0);
  const [answerInsight, setAnswerInsight] = useState<any>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [damageFloat, setDamageFloat] = useState<{ player?: string | null; enemy?: string | null }>({});
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [powerups, setPowerups] = useState<Stage7PowerupState>({ shieldActive: false, furyActive: false, shieldUses: 0, furyUses: 0 });
  const [stage9Inventory, setStage9Inventory] = useState<{ shield: number; fury: number; xpSurge: number; hintDiscount: number; extraLife: number }>({ shield: 0, fury: 0, xpSurge: 0, hintDiscount: 0, extraLife: 0 });
  const userIdRef = useRef<string>("");
  const [stage8History, setStage8History] = useState<Stage8QuestionResult[]>([]);
  const [xpBoostRemaining, setXpBoostRemaining] = useState(0);
  const [microRewardFlash, setMicroRewardFlash] = useState<string | null>(null);
  const [showSessionIntel, setShowSessionIntel] = useState(false);
  const [achievementFlash, setAchievementFlash] = useState<string | null>(null);
  const [fatigueState, setFatigueState] = useState<Stage8Fatigue>({ fatigued: false, reason: null, suggestion: null });
  const [sessionStage, setSessionStage] = useState(1);
  const [stageAnswered, setStageAnswered] = useState(0);
  const [stageCorrect, setStageCorrect] = useState(0);
  const [stageBanner, setStageBanner] = useState<string | null>(null);
  const [stageEnemyHP, setStageEnemyHP] = useState(90);
  const questionStartRef = useRef(Date.now());
  const timeSlowActiveRef = useRef(false);

  const finishedOnceRef = useRef(false);

  const maxStages = useMemo(() => inferMaxStages(title, combatQuestions.length), [title, combatQuestions.length]);
  const stageConfigs = useMemo(() => buildStageConfigs(title, maxStages, encounterType), [title, maxStages, encounterType]);
  const currentStageConfig = useMemo(() => stageConfigs[Math.min(stageConfigs.length - 1, Math.max(0, sessionStage - 1))] || buildStageConfigs(title, 1, encounterType)[0], [stageConfigs, sessionStage, title, encounterType]);

  const { state, question, select, clear, submit, submitManual, next, addTime, currentDomainId, currentMastery, outcome } = useCombatQuiz({    questions: combatQuestions,
    rules,
    timed,
    onXp,
    getActiveModifiers: () => ({ shieldActive: powerups.shieldActive, furyActive: powerups.furyActive }),
    getQuestionLevel: () => (Math.max(effectiveQuestionTier, Math.min(3, Math.ceil(sessionStage / 2))) as DifficultyTier),
    getPlayerDamageTaken: () => currentStageConfig.playerDamage,
    getEnemyDamageDealt: ({ correct }) => correct ? Math.ceil(currentStageConfig.hp / 3) : 0,
    getHealOnCorrect: () => (Math.random() < currentStageConfig.healChance ? (currentStageConfig.healMin + Math.floor(Math.random() * (currentStageConfig.healMax - currentStageConfig.healMin + 1))) : 0),
    getXpMultiplier: ({ correct }) => (correct && xpBoostRemaining > 0 ? 1.25 : 1),
    getXpBonus: ({ correct }) => {
      if (!correct) return 0;
      const reward = getMicroReward({ streak: streak + 1, questionIndex: state.idx, totalQuestions: combatQuestions.length, correct });
      return reward?.xp || 0;
    },
    onConsumeModifier: (name) => {
      setPowerups((current) => ({
        ...current,
        shieldActive: name === "shieldActive" ? false : current.shieldActive,
        furyActive: name === "furyActive" ? false : current.furyActive,
      }));
    },
    onSubmit: (r) => {
      const responseTimeMs = Math.max(500, Date.now() - questionStartRef.current);
      const baseTier = ((question?.level || 1) as DifficultyTier);
      setHitPulse(r.correct ? "enemy" : "player");
      if (r.correct) {
        const damage = Math.ceil(currentStageConfig.hp / 3);
        setStageEnemyHP((hp) => Math.max(0, hp - damage));
        setDamageFloat({ enemy: `-${damage} HP` });
      } else {
        setDamageFloat({ player: `-${currentStageConfig.playerDamage} HP` });
      }
      window.setTimeout(() => setDamageFloat({}), 2200);

      setStageAnswered((answered) => {
        const nextAnswered = answered + 1;
        setStageCorrect((correctCount) => {
          const nextCorrect = correctCount + (r.correct ? 1 : 0);
          if (nextAnswered >= 3) {
            if (nextCorrect >= 2) {
              setSessionStage((current) => {
                const nextStage = Math.min(maxStages, current + 1);
                if (nextStage > current) {
                  const nextConfig = stageConfigs[Math.min(stageConfigs.length - 1, nextStage - 1)];
                  setStageEnemyHP(nextConfig?.hp || currentStageConfig.hp);
                  setStageBanner(`Stage ${nextStage} • ${nextConfig?.name || "Enemy Rising"}`);
                  window.setTimeout(() => setStageBanner(null), 2200);
                } else {
                  setStageEnemyHP(currentStageConfig.hp);
                }
                return nextStage;
              });
            }
            return 0;
          }
          return nextCorrect;
        });
        if (nextAnswered >= 3) { setStageEnemyHP(currentStageConfig.hp); return 0; }
        return nextAnswered;
      });

      const nextHistory = [...stage8History, { correct: Boolean(r.correct), responseTimeMs, baseTier }].slice(-8);
      setStage8History(nextHistory);
      const fatigue = detectFatigue(nextHistory);
      setFatigueState(fatigue);

      if (r.correct) {
        setStreak((current) => {
          const nextValue = current + 1;
          setBestStreak((best) => Math.max(best, nextValue));
          setPowerups((currentPowerups) => {
            const next = { ...currentPowerups };
            if (nextValue === 3 && next.shieldUses < 1 && !next.shieldActive) next.shieldUses = 1;
            if (nextValue === 5 && next.furyUses < 1 && !next.furyActive) next.furyUses = 1;
            return next;
          });

          const micro = getMicroReward({ streak: nextValue, questionIndex: state.idx, totalQuestions: combatQuestions.length, correct: true });
          if (micro) {
            setMicroRewardFlash(`+${micro.xp} XP • ${micro.label}`);
            window.setTimeout(() => setMicroRewardFlash(null), 2400);
            if (micro.achievement) {
              setAchievementFlash(`🏆 ${micro.achievement}`);
              window.setTimeout(() => setAchievementFlash(null), 3000);
            }
          }

          if (nextValue > 0 && nextValue % 3 === 0) {
            setXpBoostRemaining(3);
          } else {
            setXpBoostRemaining((remaining) => Math.max(0, remaining - 1));
          }

          return nextValue;
        });
      } else {
        setStreak(0);
        setXpBoostRemaining((remaining) => Math.max(0, remaining - 1));
        if (fatigue.fatigued) {
          setHintMessage(fatigue.suggestion || "Momentum dipped. Try a hint or use a power-up.");
          setPowerups((current) => ({
            ...current,
            shieldUses: current.shieldUses < 1 ? 1 : current.shieldUses,
          }));
        }
      }
      if ((r.correct && !media?.enemyHitSrc) || (!r.correct && !media?.playerHitSrc)) {
        window.setTimeout(() => setHitPulse(null), 1600);
      }
    },
    initialState,
    onStateChange,
  });

  const stage8Momentum = useMemo(
    () => getSessionMomentum({ streak, currentIndex: Math.max(0, state.idx || 0), totalQuestions: combatQuestions.length, xpBoostRemaining }),
    [streak, state.idx, combatQuestions.length, xpBoostRemaining]
  );

  const stage8Difficulty = useMemo(
    () => getDynamicDifficulty({
      currentTier: ((state.tier || 1) as DifficultyTier),
      currentQuestionLevel: (question?.level || 1) as DifficultyTier,
      fatigue: fatigueState,
      recentResults: stage8History,
    }),
    [state.tier, question?.level, fatigueState, stage8History]
  );

  const effectiveQuestionTier = stage8Difficulty.adjustedTier as DifficultyTier;
  const currentStageEnemyName = useMemo(() => currentStageConfig?.name || stageEnemyName(enemyName, sessionStage, maxStages, encounterType), [currentStageConfig, enemyName, sessionStage, maxStages, encounterType]);
  const isGoldenBoss = encounterType === "boss" && sessionStage >= maxStages;

  const questionType = normalizeQuestionType(question?.type);
  const usesManualSubmit = questionType !== "multiple_choice" && questionType !== "incident" && questionType !== "true_false";


const feedbackText = useMemo(
  () => String(state.feedback || "Review the explanation and continue.").trim(),
  [state.feedback]
);

const explanationText = useMemo(() => {
  const candidate =
    typeof answerInsight?.explanation === "string"
      ? answerInsight.explanation
      : answerInsight?.explanation?.whyCorrect ||
        answerInsight?.explanation?.whyUser ||
        question?.explanation ||
        state.feedback ||
        "Review the explanation and continue.";
  return String(candidate || "").trim();
}, [answerInsight, question?.explanation, state.feedback]);

const showExpandedExplanation = useMemo(() => {
  const a = normalizeText(explanationText);
  const b = normalizeText(feedbackText);
  if (!a) return false;
  if (a === b) return false;
  if (a.includes(b) || b.includes(a)) return false;
  return true;
}, [explanationText, feedbackText]);

  useEffect(() => {
    finishedOnceRef.current = false;
    setStreak(0);
    setBestStreak(0);
    setPowerups({ shieldActive: false, furyActive: false, shieldUses: 0, furyUses: 0 });
    setStage8History([]);
    setXpBoostRemaining(0);
    setMicroRewardFlash(null);
    setAchievementFlash(null);
    setFatigueState({ fatigued: false, reason: null, suggestion: null });
    setSessionStage(1);
    setStageAnswered(0);
    setStageCorrect(0);
    setStageBanner(null);
    setStageEnemyHP(stageConfigs[0]?.hp || 90);
    questionStartRef.current = Date.now();
  }, [combatQuestions.length, timed, title]);

  useEffect(() => {
    const apply = () => setIsMobileLayout(window.innerWidth < 860);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  useEffect(() => {
    questionStartRef.current = Date.now();
  }, [question?.id]);

  useEffect(() => {
    setStageEnemyHP(currentStageConfig?.hp || 90);
  }, [sessionStage, currentStageConfig]);

  useEffect(() => {
    const data = (question?.data || {}) as Record<string, unknown>;
    setFillValue("");
    setCliValue("");
    setLogValue("");
    setMultiSelected([]);
    setHiddenChoiceIndices([]);
    setHintMessage(null);
    setAnswerInsight(null);
    if (questionType === "matching") {
      const pairs = safeArray<any>((data as any).pairs).filter((pair) => pair?.left && pair?.right);
      setMatchingSelections(Array.from({ length: pairs.length }, () => ""));
    } else {
      setMatchingSelections([]);
    }
    if (questionType === "sequence_order") {
      const items = safeArray<string>(data.items);
      const correctOrder = safeArray<string>(data.correctOrder);
      setSequenceItems(items.length ? items : correctOrder);
    } else {
      setSequenceItems([]);
    }
  }, [question?.id, questionType]);

  useEffect(() => {
    if (!question || !state.locked || state.finished) return;
    let active = true;
    const answer = deriveSelectedAnswer();
    setIsExplaining(true);
    fetch("/api/questions/explain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, answer }),
    })
      .then((res) => res.json().catch(() => null))
      .then((json) => {
        if (!active) return;
        if (json?.explanation || json?.evaluation) setAnswerInsight(json);
      })
      .catch(() => {
        if (!active) return;
        setAnswerInsight(null);
      })
      .finally(() => {
        if (active) setIsExplaining(false);
      });
    return () => {
      active = false;
    };
  }, [question?.id, state.locked, state.finished]);

  useEffect(() => {
    if (!state.finished || finishedOnceRef.current) return;
    finishedOnceRef.current = true;
    onComplete?.({
      outcome: outcome as DiabloQuizRunSummary['outcome'],
      xpEarned: Math.max(0, state.xpEarned - hintXpSpent),
      rawXpEarned: state.xpEarned,
      hintXpSpent,
      hintsUsedCount,
      correctCount: state.correctCount,
      totalQuestions: combatQuestions.length,
      playerHP: state.playerHP,
      enemyHP: state.enemyHP,
      timeLeft: state.timeLeft,
      masteryByDomain: state.mastery,
      bestStreak,
      bossEligible: combatQuestions.length > 0 ? (state.correctCount / combatQuestions.length) >= 0.7 : false,
    });
  }, [state.finished, state.xpEarned, state.correctCount, state.playerHP, state.enemyHP, state.timeLeft, combatQuestions.length, onComplete, outcome, hintXpSpent, hintsUsedCount, bestStreak]);

  const playerName = useMemo(() => {
    try {
      const u = getActiveUser();
      return (u?.displayName || "Player").toUpperCase().slice(0, 18);
    } catch {
      return "PLAYER";
    }
  }, []);

  useEffect(() => {
    const uid = resolveClientUserId();
    userIdRef.current = uid;
    if (!uid) return;
    fetch(`/api/stage9/status?userId=${encodeURIComponent(uid)}`, { cache: "no-store" as any })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("stage9"))))
      .then((json) => {
        const rows = Array.isArray(json?.inventory) ? json.inventory : [];
        const countFor = (id: string) => rows.filter((row: any) => String(row?.itemRef || "") === id).reduce((sum: number, row: any) => sum + Number(row?.quantity || 0), 0);
        setStage9Inventory({
          shield: countFor("shield_charge"),
          fury: countFor("fury_charge"),
          xpSurge: countFor("xp_surge"),
          hintDiscount: countFor("hint_discount"),
          extraLife: countFor("extra_life"),
        });
      })
      .catch(() => {});
  }, [title]);

  const domainLabel = labelForDomain(currentDomainId);
  const finished = Boolean(forceFinish) || state.finished;
  const displayedXp = Math.max(0, state.xpEarned - hintXpSpent);
  const partialScore = Number(answerInsight?.evaluation?.partialScore ?? answerInsight?.evaluation?.score ?? 0);
  const partialPercent = Math.max(0, Math.min(100, Math.round(partialScore * 100)));
  const masteryPercent = Math.max(0, Math.min(100, Math.round(currentMastery)));

  function useHint(type: HintType) {
    if (!question || state.locked) return;
    const baseCost = getHintCost(type);
    const usingDiscount = stage9Inventory.hintDiscount > 0;
    const cost = usingDiscount ? Math.max(0, baseCost - 10) : baseCost;
    if (usingDiscount && userIdRef.current) {
      fetch("/api/stage9/use-item", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: userIdRef.current, itemId: "hint_discount" }) }).catch(() => {});
      setStage9Inventory((current) => ({ ...current, hintDiscount: Math.max(0, current.hintDiscount - 1) }));
    }
    setHintXpSpent((v) => v + cost);
    setHintsUsedCount((v) => v + 1);
    if (type === "REMOVE_TWO") {
      const removable = removableIncorrectIndices(question).filter((index) => !hiddenChoiceIndices.includes(index));
      if (!removable.length) {
        setHintMessage("Remove two is only available for multiple choice and incident questions.");
        return;
      }
      setHiddenChoiceIndices((current) => [...new Set([...current, ...removable])]);
      setHintMessage(`Two weak answers removed. XP penalty: ${cost}.`);
      return;
    }
    if (type === "PARTIAL_EXPLANATION") {
      setHintMessage(`${partialExplanation(question.explanation)} (−${cost} XP)`);
      return;
    }
    setHintMessage(`${domainHintLabel(question.domainId || currentDomainId)} focus — use the strongest core concept first. (−${cost} XP)`);
  }

  function deriveSelectedAnswer() {
    const data = (question?.data || {}) as Record<string, unknown>;
    if (!question) return undefined;
    if (questionType === "multiple_choice" || questionType === "incident" || questionType === "true_false") {
      const choices = safeArray<string>(question.choices?.length ? question.choices : data.choices);
      return typeof state.selected === "number" ? choices[state.selected] ?? state.selected : state.selected;
    }
    if (questionType === "fill_blank") return fillValue;
    if (questionType === "cli_command") return cliValue;
    if (questionType === "log_analysis") {
      const logChoices = safeArray<string>((data as any).choices);
      return logChoices.length && typeof state.selected === "number" ? logChoices[state.selected] ?? state.selected : logValue;
    }
    if (questionType === "sequence_order") return sequenceItems;
    if (questionType === "multi_select") return multiSelected;
    return state.selected;
  }

  async function handleNext() {
    const currentQuestion = question as any;
    let awarded = false;
    if (state.locked && currentQuestion?.sessionQuestionId && onAdvanceQuestion) {
      const result = await onAdvanceQuestion({
        question: currentQuestion,
        isCorrect: state.lastWasCorrect,
        selectedAnswer: deriveSelectedAnswer(),
        nextIndex: Math.min(state.idx + 1, combatQuestions.length),
        stateSnapshot: { ...state, idx: Math.min(state.idx + 1, combatQuestions.length) },
      });
      awarded = Boolean((result as any)?.goldenAwarded);
    }
    next();
    if (awarded) {
      setGoldenEntryFlash("✅ Golden sweepstakes entry added!");
      window.setTimeout(() => setGoldenEntryFlash(null), 4000);
    }
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
    if (questionType === "log_analysis") {
      const logChoices = safeArray<string>(((question.data || {}) as any).choices);
      answer = logChoices.length ? state.selected : logValue;
    }
    if (questionType === "matching") answer = matchingSelections;

    const result = evaluateQuestionAnswer({
      type: question.type,
      prompt: question.prompt,
      correctIndex: question.correctIndex,
      choices: question.choices,
      data: question.data,
      answer,
    });

    if (questionType === "cli_command") {
      const nextCommand = cliValue.trim();
      if (nextCommand) setCommandHistory((current) => [nextCommand, ...current.filter((value) => value !== nextCommand)].slice(0, 4));
    }

    const partialRatio = Number(result?.partialScore ?? result?.score ?? 0);
    const scaledXp = result.correct ? undefined : Math.round((effectiveQuestionTier * 15) * Math.max(0, Math.min(1, partialRatio)));
    submitManual({
      correct: result.correct,
      domainId: question.domainId,
      level: effectiveQuestionTier,
      xpDelta: scaledXp,
      feedback: result.correct
        ? question.explanation || null
        : partialRatio > 0
          ? `Partial credit: ${Math.round(partialRatio * 100)}%. ${result.feedback || question.explanation || "Review the explanation and continue."}`
          : result.feedback || question.explanation || null,
    });
  }

  async function activateShield() {
    if (powerups.shieldActive || state.locked) return;
    if (powerups.shieldUses > 0) {
      setPowerups((current) => ({ ...current, shieldUses: current.shieldUses - 1, shieldActive: true }));
      return;
    }
    if (stage9Inventory.shield > 0 && userIdRef.current) {
      const res = await fetch("/api/stage9/use-item", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: userIdRef.current, itemId: "shield_charge" }) }).then((r) => r.json()).catch(() => null);
      if (res?.ok) {
        setStage9Inventory((current) => ({ ...current, shield: Math.max(0, current.shield - 1) }));
        setPowerups((current) => ({ ...current, shieldActive: true }));
      }
    }
  }

  async function activateFury() {
    if (powerups.furyActive || state.locked) return;
    if (powerups.furyUses > 0) {
      setPowerups((current) => ({ ...current, furyUses: current.furyUses - 1, furyActive: true }));
      return;
    }
    if (stage9Inventory.fury > 0 && userIdRef.current) {
      const res = await fetch("/api/stage9/use-item", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: userIdRef.current, itemId: "fury_charge" }) }).then((r) => r.json()).catch(() => null);
      if (res?.ok) {
        setStage9Inventory((current) => ({ ...current, fury: Math.max(0, current.fury - 1) }));
        setPowerups((current) => ({ ...current, furyActive: true }));
      }
    }
  }

  async function activateXpSurge() {
    if (state.locked || stage9Inventory.xpSurge <= 0 || !userIdRef.current) return;
    const res = await fetch("/api/stage9/use-item", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: userIdRef.current, itemId: "xp_surge" }) }).then((r) => r.json()).catch(() => null);
    if (res?.ok) {
      setStage9Inventory((current) => ({ ...current, xpSurge: Math.max(0, current.xpSurge - 1) }));
      addTime(10);
      timeSlowActiveRef.current = true;
      setMicroRewardFlash("⏳ Time Slow active for +10s");
      window.setTimeout(() => { timeSlowActiveRef.current = false; setMicroRewardFlash(null); }, 10000);
    }
  }


  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      const tag = (target?.tagName || "").toLowerCase();
      if (tag === "textarea") return;
      if (!state.locked && canSubmitCurrentQuestion()) {
        e.preventDefault();
        if (usesManualSubmit) handleManualSubmit();
        else submit();
      } else if (state.locked) {
        e.preventDefault();
        void handleNext();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.locked, fillValue, cliValue, logValue, matchingSelections, multiSelected, sequenceItems, state.selected, usesManualSubmit, question]);

  function canSubmitCurrentQuestion() {
    if (!question || state.locked) return false;
    if (!usesManualSubmit) return state.selected != null;
    if (questionType === "fill_blank") return fillValue.trim().length > 0;
    if (questionType === "sequence_order") return sequenceItems.length > 0;
    if (questionType === "multi_select") return multiSelected.length > 0;
    if (questionType === "cli_command") return cliValue.trim().length > 0;
    if (questionType === "log_analysis") {
      const logChoices = safeArray<string>((((question.data || {}) as any).choices));
      return logChoices.length ? state.selected != null : logValue.trim().length > 0;
    }
    if (questionType === "matching") return matchingSelections.length > 0 && matchingSelections.every((value) => value.trim().length > 0);
    return false;
  }

  function triggerPrimaryAction() {
    if (!question) return;
    if (state.locked) {
      void handleNext();
      return;
    }
    if (!canSubmitCurrentQuestion()) return;
    if (usesManualSubmit) {
      handleManualSubmit();
    } else {
      submit();
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter") return;
      if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      const tag = (target?.tagName || "").toLowerCase();
      const editable = target?.getAttribute?.("contenteditable");
      if (editable === "true" || tag === "button") return;
      event.preventDefault();
      triggerPrimaryAction();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    question?.id,
    state.locked,
    state.selected,
    usesManualSubmit,
    fillValue,
    cliValue,
    logValue,
    sequenceItems,
    multiSelected,
    matchingSelections,
  ]);

  return (
    <div
      className="modalShell d2QuizShell"
      style={{ position: "relative", width: "min(96vw, 1600px)", maxWidth: media?.width || 1480, height: "calc(100dvh - 24px)", maxHeight: "calc(100dvh - 24px)", minHeight: "calc(100dvh - 24px)", margin: "0 auto", display: "flex", flexDirection: "column" }}
    >
      <div className="modalHead">
        <div>
          <div className="modalTitle d2Roman">{title}</div>
          
        </div>
        {onExit ? (
          <button className="btn" type="button" onClick={onExit}>{exitLabel}</button>
        ) : (
          <Link className="btn" href={exitHref}>{exitLabel}</Link>
        )}
      </div>

      <div className="modalBody d2QuizBody" style={{ flex: 1, overflow: "hidden", paddingTop: 0 }}>
        {stageBanner ? <div className="stageTransitionBanner">{stageBanner}</div> : null}
        {!isMobileLayout ? (
          <div className="d2InterviewGrid d2QuizGrid stage8CompactGrid" style={{ height: "100%", alignItems: "stretch" }}>
            <div style={{ display: "grid", gap: 10, alignContent: "start", minHeight: 0 }}>
              <div className={hitPulse === "player" ? "d2Shake" : ""}>
                <D2LifeOrb value={state.playerHP} name={playerName} />
              </div>
              <ModelPanel title={playerName} src={playerVideo} loop={!isPlayerHitVideo} onEnded={isPlayerHitVideo ? () => setHitPulse(null) : undefined} height="clamp(180px, 22vh, 280px)" damageText={damageFloat.player || null} damageTone="player" />
              <div className="stage7PowerStrip underPlayer">
                <button className={"d2Btn power" + (powerups.shieldActive ? " active" : "")} type="button" disabled={state.locked || powerups.shieldActive || (powerups.shieldUses + stage9Inventory.shield) <= 0} onClick={activateShield}>Shield {powerups.shieldActive ? "On" : (powerups.shieldUses + stage9Inventory.shield) > 0 ? `x${powerups.shieldUses + stage9Inventory.shield}` : "Locked"}</button>
                <button className={"d2Btn power" + (powerups.furyActive ? " active" : "")} type="button" disabled={state.locked || powerups.furyActive || (powerups.furyUses + stage9Inventory.fury) <= 0} onClick={activateFury}>Fury {powerups.furyActive ? "On" : (powerups.furyUses + stage9Inventory.fury) > 0 ? `x${powerups.furyUses + stage9Inventory.fury}` : "Locked"}</button>
                <button className="d2Btn power" type="button" disabled={state.locked || stage9Inventory.xpSurge <= 0} onClick={activateXpSurge}>Time Slow {stage9Inventory.xpSurge > 0 ? `x${stage9Inventory.xpSurge}` : "Locked"}</button>
              </div>
            </div>

            <div className={"d2QuestionCard d2QuizQuestionCard " + (hitPulse === "enemy" ? "d2HitFlash" : "") + ((question as any)?.isGolden ? " d2GoldenQuestionCard" : "") + (isGoldenBoss ? " d2GoldenBossCard" : "") } style={{ minHeight: 0, height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <span className="d2Rivet" style={{ left: 12, top: 12 }} />
              <span className="d2Rivet" style={{ right: 12, top: 12 }} />
              <span className="d2Rivet" style={{ left: 12, bottom: 12 }} />
              <span className="d2Rivet" style={{ right: 12, bottom: 12 }} />

              {!finished && question ? (
                <>
                  {goldenEntryFlash ? <div className="badge" style={{ marginBottom: 10, borderColor: "rgba(255,215,64,0.55)", color: "#ffe28a", background: "rgba(255,215,64,0.10)" }}>{goldenEntryFlash}</div> : null}
                  <div className="stageHeaderRow">
                    <div>
                      <div style={{ fontWeight: 900, letterSpacing: 0.6, opacity: 0.9 }}>
                        Q{state.idx + 1} / {combatQuestions.length}
                      </div>
                      <div className="stageLabelPill">Stage {sessionStage} • {metaLeft || "Combat Quiz"}</div>
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {timed ? <span className="badge" style={{ fontVariantNumeric: "tabular-nums" }}>⏱ {Math.max(0, state.timeLeft)}s</span> : null}
                      <span className="badge">{labelForType(questionType)}</span>
                      {metaRight ? <span className="badge">{metaRight}</span> : null}
                    </div>
                  </div>

                  <div style={{ marginTop: 10, fontSize: "clamp(18px, 1.7vw, 32px)", lineHeight: 1.16, fontWeight: 900 }}>{question.prompt}</div>

                  <DomainRuneBar domainLabel={domainLabel} mastery={currentMastery} tier={state.tier} />
                  <div className="stageProgressDots">{Array.from({ length: 3 }).map((_, idx) => <span key={idx} className={"stageDot" + (idx < stageAnswered ? " active" : "") + (idx === stageAnswered && !state.locked ? " current" : "") } />)}</div>

                  <div className="stage5MetaStrip">
                    <span className="badge">Mastery {masteryPercent}%</span>
                    <span className="badge">Question {Math.min(state.idx + 1, combatQuestions.length)} / {combatQuestions.length}</span>
                    <span className="badge">Streak {streak}</span>
                    {bestStreak > 0 ? <span className="badge">Best {bestStreak}</span> : null}
                    {partialPercent > 0 && state.locked ? <span className="badge">Partial credit {partialPercent}%</span> : null}
                  </div>

                  <div className="stage8CompactBar" style={{ marginTop: 10 }}>
                    <div className="stage8CompactBarRow">
                      <div className="stage8CompactMini">
                        <span className="badge">🔥 Reward in {stage8Momentum.nextRewardIn}</span>
                        <span className="badge">{stage8Momentum.xpBoostActive ? `⚡ Boost ${stage8Momentum.xpBoostRemaining}` : "⚡ Boost readying"}</span>
                        <span className="badge">Tier {effectiveQuestionTier}</span>
                        <span className="badge">Stage {sessionStage}/{maxStages}</span>
                        {microRewardFlash ? <span className="badge stage8MicroFlash">{microRewardFlash}</span> : null}
                      </div>
                      <button type="button" className="d2Btn compact" onClick={() => setShowSessionIntel((v) => !v)}>
                        {showSessionIntel ? "Hide session info" : "Session info"}
                      </button>
                    </div>
                    {showSessionIntel ? (
                      <div className="card stage8IntelPanel" style={{ marginTop: 8, padding: 10, background: "rgba(110,190,255,0.07)", borderColor: fatigueState.fatigued ? "rgba(255,170,90,0.30)" : "rgba(110,190,255,0.18)" }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <span className="badge">Pace {fatigueState.fatigued ? "recovering" : "steady"}</span>
                          <span className="badge">Difficulty {effectiveQuestionTier}</span>
                        </div>
                        {fatigueState.fatigued ? <div className="muted stage8AssistText">💡 Easier question incoming.</div> : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="stage7PowerStrip">
                    <button className={"d2Btn power" + (powerups.shieldActive ? " active" : "")} type="button" disabled={state.locked || powerups.shieldActive || (powerups.shieldUses + stage9Inventory.shield) <= 0} onClick={activateShield}>Shield {powerups.shieldActive ? "On" : (powerups.shieldUses + stage9Inventory.shield) > 0 ? `x${powerups.shieldUses + stage9Inventory.shield}` : "Locked"}</button>
                    <button className={"d2Btn power" + (powerups.furyActive ? " active" : "")} type="button" disabled={state.locked || powerups.furyActive || (powerups.furyUses + stage9Inventory.fury) <= 0} onClick={activateFury}>Fury {powerups.furyActive ? "On" : (powerups.furyUses + stage9Inventory.fury) > 0 ? `x${powerups.furyUses + stage9Inventory.fury}` : "Locked"}</button>
                <button className="d2Btn power" type="button" disabled={state.locked || stage9Inventory.xpSurge <= 0} onClick={activateXpSurge}>Time Slow {stage9Inventory.xpSurge > 0 ? `x${stage9Inventory.xpSurge}` : "Locked"}</button>
                    <span className="stage7PowerHint">Streak 3: Shield • Streak 5: Fury</span>
                  </div>

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
                    matchingSelections,
                    setMatchingSelection: (index, value) => setMatchingSelections((current) => current.map((row, i) => i === index ? value : row)),
                    hiddenChoiceIndices,
                    commandHistory,
                  })}

                  {!state.locked ? (
                    <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="d2Btn" type="button" onClick={() => useHint("REMOVE_TWO")}>Remove 2 (−{getHintCost("REMOVE_TWO")})</button>
                      <button className="d2Btn" type="button" onClick={() => useHint("PARTIAL_EXPLANATION")}>Explain (−{getHintCost("PARTIAL_EXPLANATION")})</button>
                      <button className="d2Btn" type="button" onClick={() => useHint("DOMAIN_HINT")}>Domain (−{getHintCost("DOMAIN_HINT")})</button>
                    </div>
                  ) : null}
                  {hintMessage ? <div className="badge" style={{ marginTop: 10, whiteSpace: "normal", lineHeight: 1.4 }}>{hintMessage}</div> : null}

                  <div className="d2ActionRow stage8ActionDock" style={{ marginTop: 8, alignItems: "center" }}>
                    {!state.locked ? (
                      <>
                        <button className="d2Btn" onClick={() => triggerPrimaryAction()} disabled={!canSubmitCurrentQuestion()}>SUBMIT</button>
                        <button
                          className="d2Btn"
                          onClick={() => {
                            clear();
                            setFillValue("");
                            setCliValue("");
                            setLogValue("");
                            setMultiSelected([]);
                            setMatchingSelections([]);
                            setHiddenChoiceIndices([]);
                            setHintMessage(null);
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
                      <button className={(question as any)?.isGolden ? "gold" : "d2Btn"} onClick={() => handleNext()}>NEXT</button>
                    )}
                  </div>

                  {state.locked && (
                    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                      <div className="card stage5FeedbackCard stage5MergedFeedbackCard" style={{ padding: 12, background: (question as any)?.isGolden ? "rgba(255,215,64,0.08)" : "rgba(255,255,255,0.04)", borderColor: (question as any)?.isGolden ? "rgba(255,215,64,0.35)" : undefined }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 950 }}>{state.lastWasCorrect ? "✅ Correct" : partialPercent > 0 ? "🟨 Partial credit" : "❌ Not quite"}</div>
                          <div className="stage5ScorePill">{partialPercent}% accuracy</div>
                        </div>
                        <div className="muted" style={{ marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.42 }}>
                          {feedbackText}
                        </div>
                        {showExpandedExplanation ? (
                          <div className="stage5MergedExplanation" style={{ marginTop: 8 }}>
                            <div className="muted" style={{ whiteSpace: "pre-wrap", lineHeight: 1.42 }}>
                              {isExplaining ? "Building smart explanation…" : explanationText}
                            </div>
                          </div>
                        ) : null}
                        {(question as any)?.isGolden && state.lastWasCorrect ? <div style={{ marginTop: 8, color: "#ffe28a", fontWeight: 700 }}>Golden question cleared — click NEXT to enter the golden sweepstakes draw.</div> : null}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="card" style={{ padding: 16, background: "rgba(255,255,255,0.04)" }}>
                  <div style={{ fontWeight: 950, fontSize: 20 }}>{outcome === "victory" ? "Victory" : outcome === "defeat" ? "Defeat" : "Run complete"}</div>
                  <div className="muted" style={{ marginTop: 8 }}>Score {state.correctCount}/{combatQuestions.length} • XP +{displayedXp}</div>
                  {hintXpSpent > 0 ? <div className="muted" style={{ marginTop: 6 }}>Hints used: {hintsUsedCount} • XP spent on hints: {hintXpSpent}</div> : null}
                </div>
              )}
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <D2EnemyHealthBar value={stageEnemyHP} max={currentStageConfig.hp} name={currentStageEnemyName.toUpperCase().slice(0, 18)} />
              <ModelPanel title={currentStageEnemyName.toUpperCase().slice(0, 18)} src={enemyVideo} loop={!isEnemyHitVideo} onEnded={isEnemyHitVideo ? () => setHitPulse(null) : undefined} height="clamp(180px, 22vh, 280px)" damageText={damageFloat.enemy || null} damageTone="enemy" />
            </div>
          </div>
        ) : (
          <div className="mobileQuizStack">
            <div className="mobileQuizTopMeta">
              <div className="mobileQuizProgress">Q{Math.min(state.idx + 1, combatQuestions.length)} / {combatQuestions.length}</div>
              <div className="mobileQuizBadges">
                {timed ? <span className="badge" style={{ fontVariantNumeric: "tabular-nums" }}>⏱ {Math.max(0, state.timeLeft)}s</span> : null}
                <span className="badge">XP +{displayedXp}</span>
                <span className="badge">Streak {streak}</span>
              </div>
            </div>

            <div className="stage8CompactBar">
              <div className="stage8CompactBarRow">
                <div className="stage8CompactMini">
                  <span className="badge">🔥 {stage8Momentum.nextRewardIn} to reward</span>
                  <span className="badge">{stage8Momentum.xpBoostActive ? `⚡ Boost ${stage8Momentum.xpBoostRemaining}` : "⚡ Boost readying"}</span>
                  <span className="badge">Tier {effectiveQuestionTier}</span>
                  <span className="badge">Stage {sessionStage}/{maxStages}</span>
                </div>
                <button type="button" className="d2Btn compact" onClick={() => setShowSessionIntel((v) => !v)}>
                  {showSessionIntel ? "Hide" : "Info"}
                </button>
              </div>
              {showSessionIntel ? (
                <div className="card stage8IntelPanel" style={{ marginTop: 8, padding: 10, background: "rgba(110,190,255,0.07)", borderColor: fatigueState.fatigued ? "rgba(255,170,90,0.30)" : "rgba(110,190,255,0.18)" }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span className="badge">Pace {fatigueState.fatigued ? "recovering" : "steady"}</span>
                    <span className="badge">Difficulty {effectiveQuestionTier}</span>
                  </div>
                  {fatigueState.fatigued ? <div className="muted stage8AssistText">💡 Easier question incoming.</div> : null}
                </div>
              ) : null}
            </div>

            <div className="stage7PowerStrip mobile">
              <button className={"d2Btn power" + (powerups.shieldActive ? " active" : "")} type="button" disabled={state.locked || powerups.shieldActive || (powerups.shieldUses + stage9Inventory.shield) <= 0} onClick={activateShield}>Shield {powerups.shieldActive ? "On" : (powerups.shieldUses + stage9Inventory.shield) > 0 ? `x${powerups.shieldUses + stage9Inventory.shield}` : "Locked"}</button>
              <button className={"d2Btn power" + (powerups.furyActive ? " active" : "")} type="button" disabled={state.locked || powerups.furyActive || (powerups.furyUses + stage9Inventory.fury) <= 0} onClick={activateFury}>Fury {powerups.furyActive ? "On" : (powerups.furyUses + stage9Inventory.fury) > 0 ? `x${powerups.furyUses + stage9Inventory.fury}` : "Locked"}</button>
            </div>

            <div className="mobileCombatCard">
              <D2EnemyHealthBar value={stageEnemyHP} max={currentStageConfig.hp} name={currentStageEnemyName.toUpperCase().slice(0, 18)} />
              <div style={{ marginTop: 10 }}>
                <ModelPanel title={currentStageEnemyName.toUpperCase().slice(0, 18)} src={enemyVideo} loop={!isEnemyHitVideo} onEnded={isEnemyHitVideo ? () => setHitPulse(null) : undefined} height={180} damageText={damageFloat.enemy || null} damageTone="enemy" />
              </div>
            </div>

            <div className={"d2QuestionCard d2QuizQuestionCard mobileQuizQuestionCard " + (encounterType === "boss" ? " bossQuestionCard" : "") + (hitPulse === "enemy" ? " d2HitFlash" : "") + ((question as any)?.isGolden ? " d2GoldenQuestionCard" : "") + (isGoldenBoss ? " d2GoldenBossCard" : "")}>
              {!finished && question ? (
                <>
                  {goldenEntryFlash ? <div className="badge" style={{ marginBottom: 10, borderColor: "rgba(255,215,64,0.55)", color: "#ffe28a", background: "rgba(255,215,64,0.10)" }}>{goldenEntryFlash}</div> : null}
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <span className="badge">{labelForType(questionType)}</span>
                    <span className="badge">Stage {sessionStage}/{maxStages}</span>
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
                    matchingSelections,
                    setMatchingSelection: (index, value) => setMatchingSelections((current) => current.map((row, i) => i === index ? value : row)),
                    hiddenChoiceIndices,
                    commandHistory,
                  })}

                  {!state.locked ? (
                    <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="d2Btn" type="button" onClick={() => useHint("REMOVE_TWO")}>Remove 2 (−{getHintCost("REMOVE_TWO")})</button>
                      <button className="d2Btn" type="button" onClick={() => useHint("PARTIAL_EXPLANATION")}>Explain (−{getHintCost("PARTIAL_EXPLANATION")})</button>
                      <button className="d2Btn" type="button" onClick={() => useHint("DOMAIN_HINT")}>Domain (−{getHintCost("DOMAIN_HINT")})</button>
                    </div>
                  ) : null}
                  {hintMessage ? <div className="badge" style={{ marginTop: 10, whiteSpace: "normal", lineHeight: 1.4 }}>{hintMessage}</div> : null}

                  <div className="d2ActionRow mobileQuizActions" style={{ marginTop: 8, alignItems: "center" }}>
                    {!state.locked ? (
                      <>
                        <button className="d2Btn" onClick={() => triggerPrimaryAction()} disabled={!canSubmitCurrentQuestion()}>SUBMIT</button>
                        <button
                          className="d2Btn"
                          onClick={() => {
                            clear();
                            setFillValue("");
                            setCliValue("");
                            setLogValue("");
                            setMultiSelected([]);
                            setMatchingSelections([]);
                            setHiddenChoiceIndices([]);
                            setHintMessage(null);
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
                      <button className={(question as any)?.isGolden ? "gold" : "d2Btn"} onClick={() => handleNext()}>NEXT</button>
                    )}
                  </div>
                  {state.locked && (
                    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                      <div className="card stage5FeedbackCard stage5MergedFeedbackCard" style={{ padding: 12, background: (question as any)?.isGolden ? "rgba(255,215,64,0.08)" : "rgba(255,255,255,0.04)", borderColor: (question as any)?.isGolden ? "rgba(255,215,64,0.35)" : undefined }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 950 }}>{state.lastWasCorrect ? "✅ Correct" : partialPercent > 0 ? "🟨 Partial credit" : "❌ Not quite"}</div>
                          <div className="stage5ScorePill">{partialPercent}% accuracy</div>
                        </div>
                        <div className="muted" style={{ marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.42 }}>
                          {feedbackText}
                        </div>
                        {showExpandedExplanation ? (
                          <div className="stage5MergedExplanation" style={{ marginTop: 8 }}>
                            <div className="muted" style={{ whiteSpace: "pre-wrap", lineHeight: 1.42 }}>
                              {isExplaining ? "Building smart explanation…" : explanationText}
                            </div>
                          </div>
                        ) : null}
                        {(question as any)?.isGolden && state.lastWasCorrect ? <div style={{ marginTop: 8, color: "#ffe28a", fontWeight: 700 }}>Golden question cleared — click NEXT to enter the golden sweepstakes draw.</div> : null}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="card" style={{ padding: 16, background: "rgba(255,255,255,0.04)" }}>
                  <div style={{ fontWeight: 950, fontSize: 20 }}>{outcome === "victory" ? "Victory" : outcome === "defeat" ? "Defeat" : "Run complete"}</div>
                  <div className="muted" style={{ marginTop: 8 }}>Score {state.correctCount}/{combatQuestions.length} • XP +{displayedXp}</div>
                </div>
              )}
            </div>

            <div className="mobileCombatCard">
              <div className={hitPulse === "player" ? "d2Shake" : ""}>
                <D2LifeOrb value={state.playerHP} name={playerName} />
              </div>
              <div style={{ marginTop: 10 }}>
                <ModelPanel title={playerName} src={playerVideo} loop={!isPlayerHitVideo} onEnded={isPlayerHitVideo ? () => setHitPulse(null) : undefined} height="clamp(180px, 22vh, 280px)" damageText={damageFloat.player || null} damageTone="player" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
