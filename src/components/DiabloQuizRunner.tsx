"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import D2LifeOrb from "@/components/D2LifeOrb";
import D2EnemyHealthBar from "@/components/D2EnemyHealthBar";
import DomainRuneBar from "@/components/DomainRuneBar";
import { getActiveUser } from "@/lib/userStore";
import { HINT_COSTS, domainHintLabel, getHintCost, partialExplanation, removableIncorrectIndices, type HintType } from "@/lib/hints";
import { useCombatQuiz } from "@/engine/useCombatQuiz";
import type { CombatQuestion, CombatRules, DifficultyTier } from "@/engine/CombatQuizEngine";
import {
  normalizeQuestionType,
  safeArray,
  uniqueSortedNumbers,
  type QuestionData,
  type QuestionType,
} from "@/lib/questionTypes";
import { evaluateQuestionAnswer } from "@/lib/questionTransforms";
import type { BossProfile } from "@/lib/bossBattle";

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
  golden?: boolean;
  goldenMeta?: { probability?: number; percent?: number } | null;
};

export type DiabloQuizAnswerEvent = {
  questionId: string;
  prompt: string;
  type: QuestionType;
  domainId: string;
  difficulty: number;
  correct: boolean;
  answeredAt: string;
  golden?: boolean;
};

export type DiabloQuizRunSummary = {
  outcome: "victory" | "defeat" | "complete" | null;
  xpEarned: number;
  correctCount: number;
  totalQuestions: number;
  playerHP: number;
  enemyHP: number;
  timeLeft: number;
  domainMastery: Record<string, number>;
  answerEvents: DiabloQuizAnswerEvent[];
  goldenQuestionSeen?: boolean;
  goldenQuestionCorrect?: boolean;
  hintXpSpent?: number;
  hintsUsedCount?: number;
  hintsUsed?: Array<{ questionId: string; hintType: HintType; cost: number; usedAt: string }>;
};

export type QuizMediaConfig = {
  playerIdleSrc?: string;
  playerAttackSrc?: string;
  playerHitSrc?: string;
  enemyIdleSrc?: string;
  enemyAttackSrc?: string;
  enemyHitSrc?: string;
  width?: number;
  height?: number;
};

type ActorAnimState = "idle" | "attack" | "hit";
type DamagePopup = {
  id: number;
  target: "player" | "enemy";
  amount: number;
  kind: "damage" | "reward";
};

function labelForDomain(domainId: string) {
  const d = (domainId || "general").toLowerCase();
  if (d === "identity") return "Identity";
  if (d === "networking") return "Networking";
  if (d === "security") return "Security";
  if (d === "compute") return "Compute";
  if (d === "storage") return "Storage";
  if (d === "azure") return "Azure";
  if (d === "aws") return "AWS";
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
  return "Question";
}

function bossAbilityLabel(value?: string | null) {
  const v = String(value || "").toUpperCase();
  if (v === "SHIELD") return "Shield";
  if (v === "HEAVY_STRIKE") return "Heavy Strike";
  if (v === "DOUBLE_ATTACK") return "Double Attack";
  if (v === "DOMAIN_LOCK") return "Domain Lock";
  return value || "None";
}

function modelSrcForState(media: QuizMediaConfig | undefined, target: "player" | "enemy", state: ActorAnimState) {
  if (target === "player") {
    if (state === "attack") return media?.playerAttackSrc || media?.playerIdleSrc;
    if (state === "hit") return media?.playerHitSrc || media?.playerIdleSrc;
    return media?.playerIdleSrc;
  }
  if (state === "attack") return media?.enemyAttackSrc || media?.enemyHitSrc || media?.enemyIdleSrc;
  if (state === "hit") return media?.enemyHitSrc || media?.enemyIdleSrc;
  return media?.enemyIdleSrc;
}

function preloadMedia(media?: QuizMediaConfig) {
  const sources = [
    media?.playerIdleSrc,
    media?.playerAttackSrc,
    media?.playerHitSrc,
    media?.enemyIdleSrc,
    media?.enemyAttackSrc,
    media?.enemyHitSrc,
  ].filter(Boolean) as string[];
  const els: HTMLVideoElement[] = [];
  sources.forEach((src) => {
    const v = document.createElement("video");
    v.preload = "auto";
    v.muted = true;
    v.playsInline = true;
    v.src = src;
    try {
      v.load();
    } catch {}
    els.push(v);
  });
  return () => {
    els.forEach((v) => {
      try {
        v.pause();
        v.removeAttribute("src");
        v.load();
      } catch {}
    });
  };
}

function ModelPanel(props: {
  title: string;
  src?: string;
  mirrored?: boolean;
  bossMode?: boolean;
  goldenBoss?: boolean;
  state?: ActorAnimState;
  shake?: boolean;
  glow?: boolean;
}) {
  const { title, src, mirrored = false, bossMode = false, goldenBoss = false, state = "idle", shake = false, glow = false } = props;
  return (
    <div
      className={`card luModelPanel ${state !== "idle" ? `luActor-${state}` : ""} ${shake ? "luActor-shake" : ""} ${glow ? "luActor-glow" : ""}`}
      style={{
        padding: 10,
        background: goldenBoss ? "rgba(58,45,10,0.28)" : "rgba(255,255,255,0.04)",
        minHeight: bossMode ? 286 : 250,
        border: bossMode ? (goldenBoss ? "1px solid rgba(245,204,74,0.7)" : "1px solid rgba(149,76,233,0.5)") : undefined,
        boxShadow: goldenBoss ? "0 0 22px rgba(245,204,74,0.22)" : bossMode ? "0 0 16px rgba(149,76,233,0.15)" : undefined,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.6, opacity: 0.88, marginBottom: 8 }}>{title}</div>
      <div className="luModelViewport" style={{ borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(5,10,20,0.85)" }}>
        {src ? (
          <video
            key={`${src}_${state}`}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="luModelVideo"
            style={{ display: "block", width: "100%", height: bossMode ? 266 : 230, objectFit: "cover", transform: mirrored ? "scaleX(-1)" : undefined }}
          >
            <source src={src} type="video/mp4" />
          </video>
        ) : (
          <div style={{ height: bossMode ? 266 : 230, display: "grid", placeItems: "center", opacity: 0.7 }}>Video slot ready</div>
        )}
        <div className={`luModelOverlay ${goldenBoss ? "gold" : ""} ${state}`} />
      </div>
    </div>
  );
}

function DamageFloat(props: { popup: DamagePopup }) {
  const { popup } = props;
  return <div className={`luDamageFloat ${popup.target} ${popup.kind}`}>{popup.kind === "reward" ? (popup.amount > 0 ? `+${popup.amount}` : "BLOCK") : `-${popup.amount}`}</div>;
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
  sequenceItems: string[];
  moveSequenceItem: (from: number, to: number) => void;
  multiSelected: number[];
  toggleMultiSelected: (index: number) => void;
  hiddenChoices?: number[];
}) {
  const { question, state, mcqSelected, onSelectMcq, fillValue, setFillValue, cliValue, setCliValue, sequenceItems, moveSequenceItem, multiSelected, toggleMultiSelected, hiddenChoices = [] } = args;
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
          if (hiddenChoices.includes(index) && !(state.locked && index === correctIndex)) return null;
          const isSel = mcqSelected === index;
          const isOk = state.locked && index === correctIndex;
          const isBad = state.locked && isSel && index !== correctIndex;
          return (
            <button key={index} type="button" className={"d2ChoiceBtn" + (isSel ? " selected" : "")} onClick={() => onSelectMcq(index)} disabled={state.locked} style={{ borderColor: isOk ? "rgba(46, 204, 113, 0.55)" : isBad ? "rgba(255, 90, 90, 0.55)" : undefined }}>
              {choice}
            </button>
          );
        })}
      </div>
    );
  }

  if (type === "fill_blank") {
    return <div style={{ marginTop: 14 }}><input value={fillValue} onChange={(e) => setFillValue(e.target.value)} disabled={state.locked} placeholder={String(data.placeholder || "Type your answer")} className="input" style={{ width: "100%", minHeight: 50 }} /></div>;
  }

  if (type === "cli_command") {
    return (
      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        {data.hint ? <div className="badge">Hint: {String(data.hint)}</div> : null}
        <textarea value={cliValue} onChange={(e) => setCliValue(e.target.value)} disabled={state.locked} placeholder={String(data.placeholder || "Enter the command")} className="input" style={{ width: "100%", minHeight: 120, resize: "vertical", fontFamily: "monospace" }} />
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
            <label key={index} className="card" style={{ padding: 12, display: "flex", gap: 10, alignItems: "center", background: "rgba(255,255,255,0.04)", border: isOk ? "1px solid rgba(46, 204, 113, 0.55)" : isBad ? "1px solid rgba(255, 90, 90, 0.55)" : "1px solid rgba(255,255,255,0.08)" }}>
              <input type="checkbox" checked={checked} disabled={state.locked} onChange={() => toggleMultiSelected(index)} />
              <span>{choice}</span>
            </label>
          );
        })}
      </div>
    );
  }

  return null;
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
  media?: QuizMediaConfig;
  rules?: Partial<CombatRules>;
  bossMode?: boolean;
  goldenBoss?: boolean;
  bossProfile?: BossProfile;
}) {
  const { title, subtitle, enemyName = "Lagger", questions, timed = false, metaLeft, metaRight, forceFinish, exitHref = "/dashboard", exitLabel = "Close", onExit, onComplete, onXp, media, rules, bossMode = false, goldenBoss = false, bossProfile } = props;

  const combatQuestions: CombatQuestion[] = useMemo(() => questions.map((q, i) => ({ id: q.id || `q_${i}`, prompt: q.prompt, type: normalizeQuestionType(q.type), choices: q.choices, correctIndex: typeof q.correctIndex === "number" ? q.correctIndex : null, data: q.data, explanation: q.explanation, domainId: q.domainId, level: q.level })), [questions]);

  const [hitPulse, setHitPulse] = useState<null | "player" | "enemy">(null);
  const [playerAnim, setPlayerAnim] = useState<ActorAnimState>("idle");
  const [enemyAnim, setEnemyAnim] = useState<ActorAnimState>("idle");
  const [damageFloats, setDamageFloats] = useState<DamagePopup[]>([]);
  const answerEventsRef = useRef<DiabloQuizAnswerEvent[]>([]);
  const currentQuestionRef = useRef<CombatQuestion | undefined>(undefined);
  const [fillValue, setFillValue] = useState("");
  const [cliValue, setCliValue] = useState("");
  const [sequenceItems, setSequenceItems] = useState<string[]>([]);
  const [multiSelected, setMultiSelected] = useState<number[]>([]);
  const [hintXpSpent, setHintXpSpent] = useState(0);
  const [questionHintState, setQuestionHintState] = useState<Record<string, { removedChoices?: number[]; partialExplanation?: string | null; domainHint?: string | null; usedTypes: HintType[] }>>({});
  const hintEventsRef = useRef<Array<{ questionId: string; hintType: HintType; cost: number; usedAt: string }>>([]);
  const finishedOnceRef = useRef(false);
  const timeoutRefs = useRef<number[]>([]);

  const pushFloat = (target: "player" | "enemy", amount: number, kind: "damage" | "reward" = "damage") => {
    const id = Date.now() + Math.floor(Math.random() * 100000);
    setDamageFloats((current) => [...current, { id, target, amount, kind }]);
    const t = window.setTimeout(() => setDamageFloats((current) => current.filter((popup) => popup.id !== id)), 1100);
    timeoutRefs.current.push(t);
  };

  const queue = (fn: () => void, delay: number) => {
    const t = window.setTimeout(fn, delay);
    timeoutRefs.current.push(t);
  };

  const resetActors = () => {
    setPlayerAnim("idle");
    setEnemyAnim("idle");
  };

  const { state, question, select, clear, submit, submitManual, next, currentDomainId, currentMastery, outcome } = useCombatQuiz({
    questions: combatQuestions,
    timed,
    rules,
    onXp,
    onSubmit: (r) => {
      setHitPulse(r.correct ? "enemy" : "player");
      const activeQuestion = currentQuestionRef.current;
      if (activeQuestion) {
        answerEventsRef.current = [...answerEventsRef.current, { questionId: activeQuestion.id, prompt: activeQuestion.prompt, type: normalizeQuestionType(activeQuestion.type), domainId: activeQuestion.domainId || "general", difficulty: activeQuestion.level || 1, correct: r.correct, answeredAt: new Date().toISOString(), golden: Boolean((questions[state.idx] as any)?.golden) }];
      }
      if (r.correct) {
        setPlayerAnim(media?.playerAttackSrc ? "attack" : "idle");
        setEnemyAnim("idle");
        queue(() => {
          setEnemyAnim(r.shieldBlocked ? "idle" : "hit");
          if (r.shieldBlocked) {
            pushFloat("enemy", 0, "reward");
          } else if (r.enemyDamage > 0) {
            pushFloat("enemy", r.enemyDamage, "damage");
          }
        }, media?.playerAttackSrc ? 260 : 120);
      } else {
        setEnemyAnim(media?.enemyAttackSrc ? "attack" : (media?.enemyHitSrc ? "hit" : "idle"));
        queue(() => {
          setPlayerAnim("hit");
          if (r.playerDamage > 0) pushFloat("player", r.playerDamage, "damage");
        }, media?.enemyAttackSrc ? 240 : 120);
      }
      queue(() => setHitPulse(null), 460);
      queue(() => resetActors(), 980);
    },
  });

  const questionType = normalizeQuestionType(question?.type);
  const usesManualSubmit = questionType !== "multiple_choice" && questionType !== "incident";

  useEffect(() => {
    if (typeof window === "undefined") return;
    return preloadMedia(media);
  }, [media?.playerIdleSrc, media?.playerAttackSrc, media?.playerHitSrc, media?.enemyIdleSrc, media?.enemyAttackSrc, media?.enemyHitSrc]);

  useEffect(() => {
    finishedOnceRef.current = false;
    answerEventsRef.current = [];
    hintEventsRef.current = [];
    setHintXpSpent(0);
    setQuestionHintState({});
    resetActors();
  }, [combatQuestions.length, timed, title]);

  useEffect(() => {
    currentQuestionRef.current = question;
  }, [question]);

  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach((id) => window.clearTimeout(id));
      timeoutRefs.current = [];
    };
  }, []);

  useEffect(() => {
    const data = (question?.data || {}) as Record<string, unknown>;
    setFillValue("");
    setCliValue("");
    setMultiSelected([]);
    resetActors();
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
    onComplete?.({ outcome, xpEarned: state.xpEarned, correctCount: state.correctCount, totalQuestions: combatQuestions.length, playerHP: state.playerHP, enemyHP: state.enemyHP, timeLeft: state.timeLeft, domainMastery: state.mastery, answerEvents: answerEventsRef.current, goldenQuestionSeen: answerEventsRef.current.some((event) => event.golden), goldenQuestionCorrect: answerEventsRef.current.some((event) => event.golden && event.correct), hintXpSpent, hintsUsedCount: hintEventsRef.current.length, hintsUsed: hintEventsRef.current });
  }, [state.finished, state.xpEarned, state.correctCount, state.playerHP, state.enemyHP, state.timeLeft, combatQuestions.length, onComplete, outcome]);

  const availableXp = useMemo(() => Math.max(0, Number(getActiveUser()?.xp || 0) + state.xpEarned - hintXpSpent), [state.xpEarned, hintXpSpent]);
  const currentQuestionHints = question ? (questionHintState[question.id] || { usedTypes: [] as HintType[] }) : { usedTypes: [] as HintType[] };

  function useHint(hintType: HintType) {
    if (!question || state.locked) return;
    const current = questionHintState[question.id] || { usedTypes: [] as HintType[] };
    if (current.usedTypes.includes(hintType)) return;
    const cost = getHintCost(hintType);
    if (availableXp < cost) return;

    const nextState = { ...current, usedTypes: [...current.usedTypes, hintType] } as { removedChoices?: number[]; partialExplanation?: string | null; domainHint?: string | null; usedTypes: HintType[] };
    if (hintType === "REMOVE_TWO") nextState.removedChoices = removableIncorrectIndices(question);
    if (hintType === "PARTIAL_EXPLANATION") nextState.partialExplanation = partialExplanation(question.explanation);
    if (hintType === "DOMAIN_HINT") nextState.domainHint = domainHintLabel(question.domainId);

    setQuestionHintState((prev) => ({ ...prev, [question.id]: nextState }));
    setHintXpSpent((prev) => prev + cost);
    hintEventsRef.current = [...hintEventsRef.current, { questionId: question.id, hintType, cost, usedAt: new Date().toISOString() }];
  }

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
  const isGoldenQuestion = Boolean((question as any)?.golden);
  const currentAbility = bossMode ? String(((question?.data || {}) as any)?.bossAbility || "") : "";
  const playerVideo = modelSrcForState(media, "player", playerAnim);
  const enemyVideo = modelSrcForState(media, "enemy", enemyAnim);

  function handleManualSubmit() {
    if (!question || state.locked) return;
    let answer: unknown = null;
    if (questionType === "fill_blank") answer = fillValue;
    if (questionType === "sequence_order") answer = sequenceItems;
    if (questionType === "multi_select") answer = multiSelected;
    if (questionType === "cli_command") answer = cliValue;

    const result = evaluateQuestionAnswer({ type: question.type, prompt: question.prompt, correctIndex: question.correctIndex, choices: question.choices, data: question.data, answer });
    submitManual({ correct: result.correct, domainId: question.domainId, level: question.level, feedback: result.correct ? question.explanation || null : result.feedback || question.explanation || null });
  }

  function canSubmitCurrentQuestion() {
    if (!question || state.locked) return false;
    if (!usesManualSubmit) return state.selected != null;
    if (questionType === "fill_blank") return fillValue.trim().length > 0;
    if (questionType === "sequence_order") return sequenceItems.length > 0;
    if (questionType === "multi_select") return multiSelected.length > 0;
    if (questionType === "cli_command") return cliValue.trim().length > 0;
    return false;
  }

  return (
    <div className="modalShell" style={{ position: "relative", maxWidth: media?.width || 1240, minHeight: media?.height || 720, margin: "0 auto" }}>
      <div className="modalHead">
        <div>
          <div className="modalTitle d2Roman">{title}</div>
          {subtitle ? <div className="muted">{subtitle}</div> : null}
        </div>
        {onExit ? <button className="btn" type="button" onClick={onExit}>{exitLabel}</button> : <Link className="btn" href={exitHref}>{exitLabel}</Link>}
      </div>

      <div className="modalBody">
        <div className="luArenaGrid" style={{ display: "grid", gridTemplateColumns: "minmax(220px, 0.85fr) minmax(520px, 1.4fr) minmax(220px, 0.85fr)", gap: 14, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 12 }}>
            <div className="luHudPanel">
              <div className={hitPulse === "player" ? "d2Shake luHudShake" : ""} style={{ position: "relative" }}>
                <D2LifeOrb value={state.playerHP} name={playerName} />
                {damageFloats.filter((popup) => popup.target === "player").map((popup) => <DamageFloat key={popup.id} popup={popup} />)}
              </div>
            </div>
            <ModelPanel title={playerName} src={playerVideo} bossMode={bossMode} goldenBoss={goldenBoss} state={playerAnim} shake={hitPulse === "player"} glow={playerAnim === "attack"} />
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {bossMode ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="card" style={{ padding: 12, background: "rgba(255,255,255,0.04)" }}>
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.6, opacity: 0.82 }}>PLAYER STATS</div>
                  <div className="muted" style={{ marginTop: 6 }}>HP {state.playerHP}/{rules?.startHP || 100} • XP +{state.xpEarned}</div>
                  <div className="muted" style={{ marginTop: 4 }}>Level {bossProfile?.playerLevel || 1} • Mastery {Math.round(currentMastery)}%</div>
                  <div className="muted" style={{ marginTop: 4 }}>Damage mod x{Number(bossProfile?.damageModifier || 1).toFixed(2)}</div>
                </div>
                <div className="card" style={{ padding: 12, background: goldenBoss ? "rgba(50,38,10,0.28)" : "rgba(149,76,233,0.12)" }}>
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.6, opacity: 0.82 }}>BOSS STATS</div>
                  <div className="muted" style={{ marginTop: 6 }}>HP {state.enemyHP}/{bossProfile?.maxHP || rules?.startHP || 100} • Shield {bossProfile?.shield || 0}</div>
                  <div className="muted" style={{ marginTop: 4 }}>Attack {bossProfile?.attackPower || 0} • Target {labelForDomain(bossProfile?.targetDomain || currentDomainId)}</div>
                  <div className="muted" style={{ marginTop: 4 }}>Abilities: {(bossProfile?.abilities || []).map((a) => bossAbilityLabel(a)).join(" • ") || "None"}</div>
                </div>
              </div>
            ) : null}

          <div className={"d2QuestionCard " + (hitPulse === "enemy" ? "d2HitFlash" : "")} style={{ minHeight: 560, border: bossMode ? (goldenBoss ? "2px solid rgba(245,204,74,0.75)" : "2px solid rgba(149,76,233,0.55)") : undefined, boxShadow: goldenBoss ? "0 0 35px rgba(245,204,74,0.18)" : bossMode ? "0 0 20px rgba(149,76,233,0.14)" : undefined }}>
            <span className="d2Rivet" style={{ left: 12, top: 12 }} />
            <span className="d2Rivet" style={{ right: 12, top: 12 }} />
            <span className="d2Rivet" style={{ left: 12, bottom: 12 }} />
            <span className="d2Rivet" style={{ right: 12, bottom: 12 }} />

            {!finished && question ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 900, letterSpacing: 0.6, opacity: 0.9 }}>Q{state.idx + 1} / {combatQuestions.length}</div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {bossMode ? <span className="badge" style={{ background: goldenBoss ? "rgba(245,204,74,0.18)" : "rgba(149,76,233,0.18)" }}>{goldenBoss ? "✨ Golden Boss" : "⚔ Boss Battle"}</span> : null}
                    {bossMode && currentAbility ? <span className="badge" style={{ background: "rgba(255,255,255,0.08)" }}>Ability: {bossAbilityLabel(currentAbility)}</span> : null}
                    {metaLeft ? <span className="badge">{metaLeft}</span> : null}
                    {timed ? <span className="badge" style={{ fontVariantNumeric: "tabular-nums" }}>⏱ {Math.max(0, state.timeLeft)}s</span> : null}
                    <span className="badge">{labelForType(questionType)}</span>
                    {isGoldenQuestion ? <span className="badge" style={{ background: "rgba(245,204,74,0.18)", borderColor: "rgba(245,204,74,0.45)" }}>⭐ Golden</span> : null}
                    {metaRight ? <span className="badge">{metaRight}</span> : null}
                    <span className="badge">XP +{state.xpEarned}</span>
                  </div>
                </div>

                <div style={{ marginTop: 12, fontSize: 22, lineHeight: 1.35, fontWeight: 900 }}>{question.prompt}</div>
                <DomainRuneBar domainLabel={domainLabel} mastery={currentMastery} tier={state.tier} />

                <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span className="badge">XP Bank {availableXp}</span>
                    <button type="button" className="d2Btn" disabled={state.locked || currentQuestionHints.usedTypes.includes("REMOVE_TWO") || availableXp < HINT_COSTS.REMOVE_TWO || !(questionType === "multiple_choice" || questionType === "incident")} onClick={() => useHint("REMOVE_TWO")}>Hint 1 · Remove Two (-5 XP)</button>
                    <button type="button" className="d2Btn" disabled={state.locked || currentQuestionHints.usedTypes.includes("PARTIAL_EXPLANATION") || availableXp < HINT_COSTS.PARTIAL_EXPLANATION} onClick={() => useHint("PARTIAL_EXPLANATION")}>Hint 2 · Partial Explanation (-10 XP)</button>
                    <button type="button" className="d2Btn" disabled={state.locked || currentQuestionHints.usedTypes.includes("DOMAIN_HINT") || availableXp < HINT_COSTS.DOMAIN_HINT} onClick={() => useHint("DOMAIN_HINT")}>Hint 3 · Domain Hint (-15 XP)</button>
                  </div>
                  {currentQuestionHints.partialExplanation ? <div className="card" style={{ padding: 10, background: "rgba(255,255,255,0.04)" }}><div style={{ fontSize: 12, fontWeight: 900, opacity: 0.8, marginBottom: 4 }}>PARTIAL EXPLANATION</div><div className="muted">{currentQuestionHints.partialExplanation}</div></div> : null}
                  {currentQuestionHints.domainHint ? <div className="badge">Domain hint: {currentQuestionHints.domainHint}</div> : null}
                </div>

                {renderQuestionInput({ question, state, mcqSelected: state.selected, onSelectMcq: select, fillValue, setFillValue, cliValue, setCliValue, sequenceItems, moveSequenceItem: (from, to) => setSequenceItems((current) => reorderItem(current, from, to)), multiSelected, toggleMultiSelected: (index) => setMultiSelected((current) => current.includes(index) ? current.filter((v) => v !== index) : [...current, index].sort((a, b) => a - b)), hiddenChoices: currentQuestionHints.removedChoices || [] })}

                <div className="d2ActionRow" style={{ marginTop: 14 }}>
                  {!state.locked ? (
                    <>
                      <button className="d2Btn" onClick={() => (usesManualSubmit ? handleManualSubmit() : submit())} disabled={!canSubmitCurrentQuestion()}>SUBMIT</button>
                      <button className="d2Btn" onClick={() => { clear(); setFillValue(""); setCliValue(""); setMultiSelected([]); const data = (question.data || {}) as Record<string, unknown>; const items = safeArray<string>(data.items); const correctOrder = safeArray<string>(data.correctOrder); setSequenceItems(items.length ? items : correctOrder); }}>CLEAR</button>
                    </>
                  ) : <button className="d2Btn" onClick={() => next()}>NEXT</button>}
                </div>

                {state.locked ? <div style={{ marginTop: 12 }}><div className="card" style={{ padding: 12, background: "rgba(255,255,255,0.04)" }}><div style={{ fontWeight: 950 }}>{state.lastWasCorrect ? "✅ Correct" : "❌ Not quite"}</div><div className="muted" style={{ marginTop: 6 }}>{state.feedback || "Review the explanation and continue."}</div></div></div> : null}
              </>
            ) : (
              <div className="card" style={{ padding: 16, background: bossMode ? (goldenBoss ? "rgba(50,38,10,0.32)" : "rgba(45,18,72,0.28)") : "rgba(255,255,255,0.04)" }}>
                <div style={{ fontWeight: 950, fontSize: 20 }}>{outcome === "victory" ? (bossMode ? (goldenBoss ? "Golden boss defeated" : "Boss defeated") : "Victory") : outcome === "defeat" ? "Defeat" : "Run complete"}</div>
                <div className="muted" style={{ marginTop: 8 }}>Score {state.correctCount}/{combatQuestions.length} • XP +{state.xpEarned}</div>
              </div>
            )}
          </div>

          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <div className="luHudPanel">
              <div style={{ position: "relative" }}>
                <D2EnemyHealthBar value={state.enemyHP} name={enemyName.toUpperCase().slice(0, 18)} />
                {damageFloats.filter((popup) => popup.target === "enemy").map((popup) => <DamageFloat key={popup.id} popup={popup} />)}
              </div>
            </div>
            <ModelPanel title={enemyName.toUpperCase().slice(0, 18)} src={enemyVideo} mirrored bossMode={bossMode} goldenBoss={goldenBoss} state={enemyAnim} shake={hitPulse === "enemy"} glow={enemyAnim === "attack"} />
          </div>
        </div>
      </div>

      <style jsx>{`
        .modalShell {
          animation: ${goldenBoss ? "goldPulse 2.1s ease-in-out infinite" : "none"};
        }
        .luArenaGrid {
          grid-template-columns: minmax(220px, 0.85fr) minmax(520px, 1.4fr) minmax(220px, 0.85fr);
        }
        .luHudPanel {
          position: relative;
          overflow: visible;
        }
        .luModelPanel {
          overflow: hidden;
        }
        .luModelViewport {
          position: relative;
          isolation: isolate;
        }
        .luModelVideo {
          transition: transform 220ms ease, filter 220ms ease, opacity 180ms ease;
          will-change: transform, filter;
        }
        .luActor-attack .luModelVideo {
          transform: scale(1.04) translateY(-2px);
          filter: saturate(1.18) brightness(1.06);
        }
        .luActor-hit .luModelVideo {
          filter: brightness(1.15) contrast(1.08);
        }
        .luActor-shake .luModelVideo {
          animation: actorShake 320ms ease;
        }
        .luActor-glow .luModelViewport {
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06), 0 0 18px rgba(255,163,68,0.18);
        }
        .luModelOverlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0;
          transition: opacity 180ms ease;
        }
        .luModelOverlay.attack {
          opacity: 1;
          background: radial-gradient(circle at 50% 50%, rgba(255,170,68,0.18), transparent 62%);
        }
        .luModelOverlay.hit {
          opacity: 1;
          background: radial-gradient(circle at 50% 50%, rgba(255,70,70,0.22), transparent 64%);
        }
        .luModelOverlay.gold.attack,
        .luModelOverlay.gold.hit {
          opacity: 1;
          box-shadow: inset 0 0 28px rgba(245, 204, 74, 0.12);
        }
        .luDamageFloat {
          position: absolute;
          top: 10px;
          right: 10px;
          font-size: 28px;
          font-weight: 1000;
          letter-spacing: 0.03em;
          text-shadow: 0 0 10px rgba(0,0,0,0.7), 0 0 22px rgba(0,0,0,0.35);
          pointer-events: none;
          animation: damageFloat 1.05s ease-out forwards;
          z-index: 9;
        }
        .luDamageFloat.player {
          left: 26px;
          right: auto;
        }
        .luDamageFloat.damage {
          color: #ff6b6b;
        }
        .luDamageFloat.reward {
          color: #f5cc4a;
        }
        .luHudShake {
          animation: actorShake 280ms ease;
        }
        @keyframes actorShake {
          0% { transform: translate3d(0,0,0); }
          20% { transform: translate3d(-3px,0,0); }
          40% { transform: translate3d(4px,0,0); }
          60% { transform: translate3d(-2px,0,0); }
          80% { transform: translate3d(2px,0,0); }
          100% { transform: translate3d(0,0,0); }
        }
        @keyframes damageFloat {
          0% { opacity: 0; transform: translateY(10px) scale(0.88); }
          18% { opacity: 1; transform: translateY(-4px) scale(1.06); }
          100% { opacity: 0; transform: translateY(-42px) scale(1); }
        }
        @keyframes goldPulse {
          0% { box-shadow: 0 0 0 rgba(245, 204, 74, 0.05); }
          50% { box-shadow: 0 0 28px rgba(245, 204, 74, 0.14); }
          100% { box-shadow: 0 0 0 rgba(245, 204, 74, 0.05); }
        }
        @media (max-width: 1120px) {
          .luArenaGrid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
