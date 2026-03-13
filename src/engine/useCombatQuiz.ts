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

export type CombatEngineOptions = {
  questions: CombatQuestion[];
  rules?: Partial<CombatRules>;
  /** If true, enables per-question timers that shrink as tier increases. */
  timed?: boolean;
  /** Called whenever XP increases (per correct). */
  onXp?: (xpDelta: number, totalXp: number) => void;
  /** Called after submit with a full result payload. */
  onSubmit?: (result: SubmitResult) => void;
};

export function useCombatQuiz(opts: CombatEngineOptions) {
  const rules: CombatRules = useMemo(() => ({ ...DEFAULT_RULES, ...(opts.rules || {}) }), [opts.rules]);
  const timed = Boolean(opts.timed);
  const questionsKey = useMemo(() => opts.questions.map((question) => question.id).join("|"), [opts.questions]);

  const onXpRef = useRef(opts.onXp);
  const onSubmitRef = useRef(opts.onSubmit);
  useEffect(() => {
    onXpRef.current = opts.onXp;
    onSubmitRef.current = opts.onSubmit;
  }, [opts.onXp, opts.onSubmit]);

  const [state, setState] = useState<CombatState>(() => initialCombatState(rules, timed));
  const timerRef = useRef<number | null>(null);

  const q = opts.questions[state.idx];

  const resolveQuestionModifiers = (question?: CombatQuestion | null) => {
    const data = (question?.data && typeof question.data === "object" ? question.data : {}) as Record<string, unknown>;
    const playerDamageMultiplier = Math.max(0, Number(data.playerDamageMultiplier ?? 1) || 1);
    const enemyDamageMultiplier = Math.max(0, Number(data.enemyDamageMultiplier ?? 1) || 1);
    const shieldBlocked = Boolean(data.blockNextCorrect);
    const abilityName = data.bossAbility ? String(data.bossAbility) : null;
    return { data, playerDamageMultiplier, enemyDamageMultiplier, shieldBlocked, abilityName };
  };

  useEffect(() => {
    setState(initialCombatState(rules, timed));
  }, [questionsKey, timed, rules]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback((seconds: number) => {
    stopTimer();
    if (!timed) return;
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

    const lvl = inferLevel(q);
    const eff: DifficultyTier = Math.max(state.tier, lvl) as DifficultyTier;
    const seconds = rules.timePerQuestionByTier[eff];
    startTimer(seconds);
  }, [q?.id, state.tier, state.locked, state.finished, timed, rules.timePerQuestionByTier, startTimer, stopTimer]);

  useEffect(() => {
    if (!timed || !q || state.finished || state.locked || state.timeLeft !== 0) return;

    setState((s) => {
      if (s.locked || s.finished) return s;
      const domainId = inferDomainId(q);
      const lvl = inferLevel(q);
      const effTier: DifficultyTier = Math.max(s.tier, lvl) as DifficultyTier;
      const modifiers = resolveQuestionModifiers(q);

      const correct = false;
      const xpDelta = 0;
      const playerDamage = Math.round(rules.playerDamageByTier[effTier] * modifiers.playerDamageMultiplier);
      const enemyDamage = 0;
      const playerHP = clamp(s.playerHP - playerDamage, 0, rules.startHP);
      const enemyHP = s.enemyHP;

      const prevMastery = s.mastery[domainId] ?? 50;
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
        onSubmitRef.current?.({
          correct,
          playerHP,
          enemyHP,
          xpDelta,
          tier,
          domainId,
          masteryValue: nextMastery,
          playerDamage,
          enemyDamage,
          shieldBlocked: false,
          abilityName: modifiers.abilityName,
        });
      });

      return next;
    });
  }, [timed, q, state.timeLeft, state.locked, state.finished, rules]);

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
      const lvl = inferLevel(q);
      const effTier: DifficultyTier = Math.max(s.tier, lvl) as DifficultyTier;
      const modifiers = resolveQuestionModifiers(q);
      const correct = s.selected === q.correctIndex;
      const xpDelta = correct ? rules.xpByTier[effTier] : 0;

      const playerDamage = correct ? 0 : Math.round(rules.playerDamageByTier[effTier] * modifiers.playerDamageMultiplier);
      const enemyDamage = correct ? (modifiers.shieldBlocked ? 0 : Math.round(rules.enemyDamageByTier[effTier] * modifiers.enemyDamageMultiplier)) : 0;
      const playerHP = clamp(correct ? s.playerHP : s.playerHP - playerDamage, 0, rules.startHP);
      const enemyHP = clamp(correct ? s.enemyHP - enemyDamage : s.enemyHP, 0, rules.startHP);

      const prevMastery = s.mastery[domainId] ?? 50;
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
        feedback: modifiers.shieldBlocked && correct ? ((q.explanation ? `${q.explanation} ` : "") + "The boss shield blocked the hit.") : (q.explanation || (correct ? "Direct hit." : s.timeLeft <= 0 ? "Time's up." : "Not quite.")),
      };

      queueMicrotask(() => {
        if (xpDelta > 0) onXpRef.current?.(xpDelta, next.xpEarned);
        onSubmitRef.current?.({
          correct,
          playerHP,
          enemyHP,
          xpDelta,
          tier,
          domainId,
          masteryValue: nextMastery,
          playerDamage,
          enemyDamage,
          shieldBlocked: modifiers.shieldBlocked && correct,
          abilityName: modifiers.abilityName,
        });
      });

      return next;
    });
  }, [q, rules]);

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
      const lvl = (manual.level ?? inferLevel(q)) as DifficultyTier;
      const effTier: DifficultyTier = Math.max(s.tier, lvl) as DifficultyTier;
      const modifiers = resolveQuestionModifiers(q);
      const correct = manual.correct;
      const xpDelta = typeof manual.xpDelta === "number" ? manual.xpDelta : (correct ? rules.xpByTier[effTier] : 0);

      const playerDamage = correct ? 0 : Math.round(rules.playerDamageByTier[effTier] * modifiers.playerDamageMultiplier);
      const enemyDamage = correct ? (modifiers.shieldBlocked ? 0 : Math.round(rules.enemyDamageByTier[effTier] * modifiers.enemyDamageMultiplier)) : 0;
      const playerHP = clamp(correct ? s.playerHP : s.playerHP - playerDamage, 0, rules.startHP);
      const enemyHP = clamp(correct ? s.enemyHP - enemyDamage : s.enemyHP, 0, rules.startHP);

      const prevMastery = s.mastery[domainId] ?? 50;
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
        feedback: modifiers.shieldBlocked && correct ? ((manual.feedback ?? q.explanation ?? "Direct hit.") + " The boss shield blocked the hit.") : (manual.feedback ?? q.explanation ?? (correct ? "Direct hit." : "Not quite.")),
      };

      queueMicrotask(() => {
        if (xpDelta > 0) onXpRef.current?.(xpDelta, next.xpEarned);
        onSubmitRef.current?.({
          correct,
          playerHP,
          enemyHP,
          xpDelta,
          tier,
          domainId,
          masteryValue: nextMastery,
          playerDamage,
          enemyDamage,
          shieldBlocked: modifiers.shieldBlocked && correct,
          abilityName: modifiers.abilityName,
        });
      });

      return next;
    });
  }, [q, rules]);

  const next = useCallback(() => {
    setState((s) => {
      if (s.finished) return s;
      if (s.playerHP <= 0 || s.enemyHP <= 0) return { ...s, finished: true };

      const nextIdx = s.idx + 1;
      if (nextIdx >= opts.questions.length) return { ...s, finished: true };

      return {
        ...s,
        idx: nextIdx,
        selected: null,
        locked: false,
        feedback: null,
        lastWasCorrect: null,
      };
    });
  }, [opts.questions.length]);

  const reset = useCallback(() => {
    stopTimer();
    setState(initialCombatState(rules, timed));
  }, [rules, timed, stopTimer]);

  const currentDomainId = useMemo(() => (q ? inferDomainId(q) : "general"), [q]);
  const currentMastery = state.mastery[currentDomainId] ?? 50;
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
