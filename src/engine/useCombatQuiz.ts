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

  const [state, setState] = useState<CombatState>(() => initialCombatState(rules, timed));
  const timerRef = useRef<number | null>(null);

  const q = opts.questions[state.idx];

  // Reset when the question set changes (new modal open / new run)
  useEffect(() => {
    setState(initialCombatState(rules, timed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.questions.length, timed]);

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

  // Ensure timer matches current tier/question when entering a question
  useEffect(() => {
    if (!timed) return;
    if (!q) return;
    if (state.finished) return;

    // If locked, do not tick further (explanation state)
    if (state.locked) {
      stopTimer();
      return;
    }

    const lvl = inferLevel(q);
    // Timer based on the HARDER of current tier and question level (so hard questions feel faster)
    const eff: DifficultyTier = (Math.max(state.tier, lvl) as DifficultyTier);
    const seconds = rules.timePerQuestionByTier[eff];
    startTimer(seconds);
  }, [q?.id, state.tier, state.locked, state.finished, timed, rules.timePerQuestionByTier, startTimer, stopTimer]);

  

  // If timer hits 0 in timed mode, auto-submit a "wrong" (timeout) and lock for explanation + Next.
  useEffect(() => {
    if (!timed) return;
    if (!q) return;
    if (state.finished) return;
    if (state.locked) return;
    if (state.timeLeft !== 0) return;

    // Apply timeout penalty as a wrong answer without a selection.
    setState((s) => {
      if (s.locked || s.finished) return s;
      const domainId = inferDomainId(q);
      const lvl = inferLevel(q);
      const effTier: DifficultyTier = (Math.max(s.tier, lvl) as DifficultyTier);

      const correct = false;
      const xpDelta = 0;

      const playerHP = clamp(s.playerHP - rules.playerDamageByTier[effTier], 0, rules.startHP);
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
        lastWasCorrect: correct,
        feedback: "Time's up.",
      };

      queueMicrotask(() => {
        opts.onSubmit?.({
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
  }, [timed, q?.id, state.timeLeft, state.locked, state.finished, rules, opts]);
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
      if (s.locked || s.finished) return s;
      if (s.selected === null) return s;

      const domainId = inferDomainId(q);
      const lvl = inferLevel(q);
      const effTier: DifficultyTier = (Math.max(s.tier, lvl) as DifficultyTier);

      const correct = s.selected === q.correctIndex;
      const xpDelta = correct ? rules.xpByTier[effTier] : 0;

      const playerHP = clamp(
        correct ? s.playerHP : s.playerHP - rules.playerDamageByTier[effTier],
        0,
        rules.startHP
      );

      const enemyHP = clamp(
        correct ? s.enemyHP - rules.enemyDamageByTier[effTier] : s.enemyHP,
        0,
        rules.startHP
      );

      const prevMastery = s.mastery[domainId] ?? 50; // start mid for a new domain
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
        feedback:
          q.explanation ||
          (correct ? "Direct hit." : s.timeLeft <= 0 ? "Time's up." : "Not quite."),
        // keep timeLeft frozen while locked
      };

      // external callbacks (best-effort; run outside of React state update)
      queueMicrotask(() => {
        if (xpDelta > 0) opts.onXp?.(xpDelta, next.xpEarned);
        opts.onSubmit?.({
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
  }, [q, rules, opts]);


  const submitManual = useCallback((manual: {
    correct: boolean;
    domainId?: string;
    level?: DifficultyTier;
    feedback?: string | null;
    /** Optional XP override (default uses rules.xpByTier for correct, 0 for wrong) */
    xpDelta?: number;
  }) => {
    if (!q) return;
    setState((s) => {
      if (s.locked || s.finished) return s;

      const domainId = manual.domainId ?? inferDomainId(q);
      const lvl = (manual.level ?? inferLevel(q)) as DifficultyTier;
      const effTier: DifficultyTier = (Math.max(s.tier, lvl) as DifficultyTier);

      const correct = manual.correct;
      const xpDelta = typeof manual.xpDelta === "number" ? manual.xpDelta : (correct ? rules.xpByTier[effTier] : 0);

      const playerHP = clamp(
        correct ? s.playerHP : s.playerHP - rules.playerDamageByTier[effTier],
        0,
        rules.startHP
      );

      const enemyHP = clamp(
        correct ? s.enemyHP - rules.enemyDamageByTier[effTier] : s.enemyHP,
        0,
        rules.startHP
      );

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
        feedback: manual.feedback ?? q.explanation ?? (correct ? "Direct hit." : "Not quite."),
      };

      queueMicrotask(() => {
        if (xpDelta > 0) opts.onXp?.(xpDelta, next.xpEarned);
        opts.onSubmit?.({
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
  }, [q, rules, opts]);

  const next = useCallback(() => {
    setState((s) => {
      if (s.finished) return s;

      // if someone hit 0 HP, finish immediately
      if (s.playerHP <= 0 || s.enemyHP <= 0) {
        return { ...s, finished: true };
      }

      const nextIdx = s.idx + 1;
      if (nextIdx >= opts.questions.length) {
        return { ...s, finished: true };
      }

      return {
        ...s,
        idx: nextIdx,
        selected: null,
        locked: false,
        feedback: null,
        lastWasCorrect: null,
        // timer will be re-seeded by effect
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
