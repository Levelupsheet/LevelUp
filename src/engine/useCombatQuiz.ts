"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CombatQuestion, CombatRules, CombatState, DifficultyTier, SubmitResult } from "./CombatQuizEngine";
import {
  DEFAULT_RULES,
  clamp,
  computeTierFromMasteryAvg,
  inferDomainId,
  inferLevel,
  initialCombatState,
  masteryAverage,
} from "./CombatQuizEngine";

export type CombatRuntimeModifiers = {
  shieldActive?: boolean;
  furyActive?: boolean;
  timeWarpActive?: boolean;
};

export type CombatEngineOptions = {
  questions: CombatQuestion[];
  rules?: Partial<CombatRules>;
  /** If true, enables per-question timers that shrink as tier increases. */
  timed?: boolean;
  /** Called whenever XP increases (per correct). */
  onXp?: (xpDelta: number, totalXp: number) => void;
  /** Called after submit with a full result payload. */
  onSubmit?: (result: SubmitResult) => void;
  initialState?: Partial<CombatState> | null;
  onStateChange?: (state: CombatState) => void;
  getActiveModifiers?: () => CombatRuntimeModifiers;
  onConsumeModifier?: (name: keyof CombatRuntimeModifiers) => void;
  getQuestionLevel?: (question: CombatQuestion, state: CombatState) => DifficultyTier;
  getXpMultiplier?: (args: { question: CombatQuestion; state: CombatState; correct: boolean; baseXp: number }) => number;
  getXpBonus?: (args: { question: CombatQuestion; state: CombatState; correct: boolean; baseXp: number }) => number;
};

export function useCombatQuiz(opts: CombatEngineOptions) {
  const rules: CombatRules = useMemo(() => ({ ...DEFAULT_RULES, ...(opts.rules || {}) }), [opts.rules]);
  const timed = Boolean(opts.timed);
  const questionsKey = useMemo(() => opts.questions.map((question) => question.id).join("|"), [opts.questions]);

  const onXpRef = useRef(opts.onXp);
  const onSubmitRef = useRef(opts.onSubmit);
  const onStateChangeRef = useRef(opts.onStateChange);
  const getActiveModifiersRef = useRef(opts.getActiveModifiers);
  const onConsumeModifierRef = useRef(opts.onConsumeModifier);
  const getQuestionLevelRef = useRef(opts.getQuestionLevel);
  const getXpMultiplierRef = useRef(opts.getXpMultiplier);
  const getXpBonusRef = useRef(opts.getXpBonus);
  useEffect(() => {
    onXpRef.current = opts.onXp;
    onSubmitRef.current = opts.onSubmit;
    onStateChangeRef.current = opts.onStateChange;
    getActiveModifiersRef.current = opts.getActiveModifiers;
    onConsumeModifierRef.current = opts.onConsumeModifier;
    getQuestionLevelRef.current = opts.getQuestionLevel;
    getXpMultiplierRef.current = opts.getXpMultiplier;
    getXpBonusRef.current = opts.getXpBonus;
  }, [opts.onXp, opts.onSubmit, opts.onStateChange, opts.getActiveModifiers, opts.onConsumeModifier, opts.getQuestionLevel, opts.getXpMultiplier, opts.getXpBonus]);

  function buildInitialState() {
    return { ...initialCombatState(rules, timed), ...(opts.initialState || {}) } as CombatState;
  }

  const [state, setState] = useState<CombatState>(() => buildInitialState());
  const timerRef = useRef<number | null>(null);
  const timeoutResolvedRef = useRef<string | null>(null);


  const resolveQuestionLevel = useCallback((question: CombatQuestion | undefined, combatState: CombatState) => {
    if (!question) return 1 as DifficultyTier;
    const resolved = getQuestionLevelRef.current?.(question, combatState);
    return (resolved === 1 || resolved === 2 || resolved === 3) ? resolved : inferLevel(question);
  }, []);

  const q = opts.questions[state.idx];

  useEffect(() => {
    setState(buildInitialState());
  }, [questionsKey, timed, rules, opts.initialState]);

  useEffect(() => {
    onStateChangeRef.current?.(state);
  }, [state]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback((seconds: number) => {
    stopTimer();
    if (!timed) return;
    timeoutResolvedRef.current = null;
    setState((s) => ({ ...s, timeLeft: seconds }));
    timerRef.current = window.setInterval(() => {
      setState((s) => {
        if (s.finished || s.locked) return s;
        const next = s.timeLeft - 1;
        if (next <= 0) {
          return { ...s, timeLeft: 0 };
        }
        return { ...s, timeLeft: next };
      });
    }, 1000) as any;
  }, [stopTimer, timed]);

  useEffect(() => {
    if (!timed || !q || state.finished) return;
    if (state.locked) {
      stopTimer();
      return;
    }

    const lvl = resolveQuestionLevel(q, state);
    const eff: DifficultyTier = Math.max(state.tier, lvl) as DifficultyTier;
    const seconds = rules.timePerQuestionByTier[eff];
    startTimer(seconds);
  }, [q?.id, state.tier, state.locked, state.finished, timed, rules.timePerQuestionByTier, startTimer, stopTimer, resolveQuestionLevel]);

  useEffect(() => {
    if (!timed || !q || state.finished || state.locked || state.timeLeft !== 0) return;
    const timeoutKey = `${state.idx}:${q.id || "q"}`;
    if (timeoutResolvedRef.current === timeoutKey) return;
    timeoutResolvedRef.current = timeoutKey;

    setState((s) => {
      if (s.locked || s.finished) return s;
      const domainId = inferDomainId(q);
      const lvl = resolveQuestionLevel(q, s);
      const effTier: DifficultyTier = Math.max(s.tier, lvl) as DifficultyTier;

      const correct = false;
      const xpDelta = 0;
      const modifiers = getActiveModifiersRef.current?.() || {};
      const usedShield = Boolean(modifiers.shieldActive);
      const playerHP = clamp(s.playerHP - (usedShield ? 0 : rules.playerDamageByTier[effTier]), 0, rules.startHP);
      const enemyHP = s.enemyHP;

      const prevMastery = s.mastery[domainId] ?? 0;
      const nextMastery = clamp(prevMastery - rules.masteryLossWrong, 0, 100);

      const mastery = { ...s.mastery, [domainId]: nextMastery };
      const avg = masteryAverage(mastery);
      const tier = computeTierFromMasteryAvg(avg, s.tier, rules);

      const next: CombatState = {
        ...s,
        playerHP,
        enemyHP,
        mastery,
        tier,
        locked: true,
        lastWasCorrect: false,
        feedback: "Time's up.",
      };

      queueMicrotask(() => {
        if (usedShield) onConsumeModifierRef.current?.("shieldActive");
        onSubmitRef.current?.({
          correct,
          playerHP,
          enemyHP,
          xpDelta,
          tier,
          domainId,
          masteryValue: nextMastery,
        });
      });

      return next;
    });
  }, [timed, q, state.timeLeft, state.locked, state.finished, rules, resolveQuestionLevel]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  const select = useCallback((choiceIndex: number) => {
    setState((s) => (s.locked || s.finished ? s : { ...s, selected: choiceIndex }));
  }, []);

  const clear = useCallback(() => {
    setState((s) => (s.locked || s.finished ? s : { ...s, selected: null, feedback: null, lastWasCorrect: null }));
  }, []);

  const submit = useCallback(() => {
    if (!q) return;
    setState((s) => {
      if (s.locked || s.finished || s.selected === null) return s;

      const domainId = inferDomainId(q);
      const lvl = resolveQuestionLevel(q, s);
      const effTier: DifficultyTier = Math.max(s.tier, lvl) as DifficultyTier;
      const correct = s.selected === q.correctIndex;
      const modifiers = getActiveModifiersRef.current?.() || {};
      const usedShield = !correct && Boolean(modifiers.shieldActive);
      const usedFury = correct && Boolean(modifiers.furyActive);
      const baseXp = correct ? rules.xpByTier[effTier] : 0;
      const extraMultiplier = getXpMultiplierRef.current?.({ question: q, state: s, correct, baseXp }) ?? 1;
      const extraBonus = getXpBonusRef.current?.({ question: q, state: s, correct, baseXp }) ?? 0;
      const xpDelta = correct ? Math.max(0, Math.round(baseXp * (usedFury ? 1.5 : 1) * extraMultiplier) + extraBonus) : 0;

      const playerHP = clamp(correct ? s.playerHP : s.playerHP - (usedShield ? 0 : rules.playerDamageByTier[effTier]), 0, rules.startHP);
      const enemyHP = clamp(correct ? s.enemyHP - rules.enemyDamageByTier[effTier] * (usedFury ? 2 : 1) : s.enemyHP, 0, rules.startHP);

      const prevMastery = s.mastery[domainId] ?? 0;
      const masteryDelta = correct ? rules.masteryGainBase * effTier : -rules.masteryLossWrong;
      const nextMastery = clamp(prevMastery + masteryDelta, 0, 100);

      const mastery = { ...s.mastery, [domainId]: nextMastery };
      const avg = masteryAverage(mastery);
      const tier = computeTierFromMasteryAvg(avg, s.tier, rules);

      const next: CombatState = {
        ...s,
        playerHP,
        enemyHP,
        mastery,
        tier,
        locked: true,
        lastWasCorrect: correct,
        correctCount: correct ? s.correctCount + 1 : s.correctCount,
        xpEarned: s.xpEarned + xpDelta,
        feedback: q.explanation || (correct ? "Direct hit." : s.timeLeft <= 0 ? "Time's up." : "Not quite."),
      };

      queueMicrotask(() => {
        if (usedShield) onConsumeModifierRef.current?.("shieldActive");
        if (usedFury) onConsumeModifierRef.current?.("furyActive");
        if (xpDelta > 0) onXpRef.current?.(xpDelta, next.xpEarned);
        onSubmitRef.current?.({
          correct,
          playerHP,
          enemyHP,
          xpDelta,
          tier,
          domainId,
          masteryValue: nextMastery,
        });
      });

      return next;
    });
  }, [q, rules, resolveQuestionLevel]);

  const submitManual = useCallback((manual: {
    correct: boolean;
    domainId?: string;
    level?: DifficultyTier;
    feedback?: string | null;
    xpDelta?: number;
  }) => {
    if (!q) return;
    setState((s) => {
      if (s.locked || s.finished) return s;

      const domainId = manual.domainId ?? inferDomainId(q);
      const lvl = (manual.level ?? resolveQuestionLevel(q, s)) as DifficultyTier;
      const effTier: DifficultyTier = Math.max(s.tier, lvl) as DifficultyTier;
      const correct = manual.correct;
      const modifiers = getActiveModifiersRef.current?.() || {};
      const usedShield = !correct && Boolean(modifiers.shieldActive);
      const usedFury = correct && Boolean(modifiers.furyActive);
      const baseXp = typeof manual.xpDelta === "number" ? manual.xpDelta : (correct ? rules.xpByTier[effTier] : 0);
      const extraMultiplier = getXpMultiplierRef.current?.({ question: q, state: s, correct, baseXp }) ?? 1;
      const extraBonus = getXpBonusRef.current?.({ question: q, state: s, correct, baseXp }) ?? 0;
      const xpDelta = Math.max(0, Math.round(baseXp * (usedFury ? 1.5 : 1) * extraMultiplier) + extraBonus);

      const playerHP = clamp(correct ? s.playerHP : s.playerHP - (usedShield ? 0 : rules.playerDamageByTier[effTier]), 0, rules.startHP);
      const enemyHP = clamp(correct ? s.enemyHP - rules.enemyDamageByTier[effTier] * (usedFury ? 2 : 1) : s.enemyHP, 0, rules.startHP);

      const prevMastery = s.mastery[domainId] ?? 0;
      const masteryDelta = correct ? rules.masteryGainBase * effTier : -rules.masteryLossWrong;
      const nextMastery = clamp(prevMastery + masteryDelta, 0, 100);
      const mastery = { ...s.mastery, [domainId]: nextMastery };
      const avg = masteryAverage(mastery);
      const tier = computeTierFromMasteryAvg(avg, s.tier, rules);

      const next: CombatState = {
        ...s,
        playerHP,
        enemyHP,
        mastery,
        tier,
        locked: true,
        lastWasCorrect: correct,
        correctCount: correct ? s.correctCount + 1 : s.correctCount,
        xpEarned: s.xpEarned + xpDelta,
        feedback: manual.feedback ?? q.explanation ?? (correct ? "Direct hit." : "Not quite."),
      };

      queueMicrotask(() => {
        if (usedShield) onConsumeModifierRef.current?.("shieldActive");
        if (usedFury) onConsumeModifierRef.current?.("furyActive");
        if (xpDelta > 0) onXpRef.current?.(xpDelta, next.xpEarned);
        onSubmitRef.current?.({
          correct,
          playerHP,
          enemyHP,
          xpDelta,
          tier,
          domainId,
          masteryValue: nextMastery,
        });
      });

      return next;
    });
  }, [q, rules, resolveQuestionLevel]);

  const next = useCallback(() => {
    stopTimer();
    setState((s) => {
      if (s.finished) return s;
      if (s.playerHP <= 0 || s.enemyHP <= 0) return { ...s, finished: true };

      const nextIdx = s.idx + 1;
      if (nextIdx >= opts.questions.length) return { ...s, finished: true };

      const nextQ = opts.questions[nextIdx];
      const nextLvl = nextQ ? resolveQuestionLevel(nextQ, s) : 1;
      const effNextTier: DifficultyTier = Math.max(s.tier, nextLvl) as DifficultyTier;
      return {
        ...s,
        idx: nextIdx,
        selected: null,
        locked: false,
        feedback: null,
        lastWasCorrect: null,
        timeLeft: timed ? rules.timePerQuestionByTier[effNextTier] : s.timeLeft,
      };
    });
  }, [opts.questions, rules.timePerQuestionByTier, timed, stopTimer, resolveQuestionLevel]);

  const reset = useCallback(() => {
    stopTimer();
    setState(initialCombatState(rules, timed));
  }, [rules, timed, stopTimer]);

  const currentDomainId = useMemo(() => (q ? inferDomainId(q) : "general"), [q]);
  const currentMastery = state.mastery[currentDomainId] ?? 0;
  const masteryAvg = useMemo(() => masteryAverage(state.mastery), [state.mastery]);

  const outcome = useMemo(() => {
    if (!state.finished) return null;
    if (state.enemyHP <= 0 && state.playerHP > 0) return "victory";
    if (state.playerHP <= 0) return "defeat";
    return "complete";
  }, [state.finished, state.enemyHP, state.playerHP]);

  return {
    rules,
    state,
    question: q,
    select,
    clear,
    submit,
    submitManual,
    next,
    reset,
    timed,
    currentDomainId,
    currentMastery,
    masteryAvg,
    outcome,
  };
}
