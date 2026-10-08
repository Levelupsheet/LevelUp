"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { consumeEnemyAbility, nextEnemyAbility, type EnemyProfile } from "@/engine/systems/EnemyAbilities";
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
  getPlayerDamageTaken?: (args: { question: CombatQuestion; state: CombatState; tier: DifficultyTier; correct: boolean; usedShield: boolean }) => number;
  getEnemyDamageDealt?: (args: { question: CombatQuestion; state: CombatState; tier: DifficultyTier; correct: boolean; usedFury: boolean }) => number;
  getHealOnCorrect?: (args: { question: CombatQuestion; state: CombatState; tier: DifficultyTier }) => number;
  finishOnEnemyDefeat?: boolean;
  getEnemyProfile?: (question: CombatQuestion) => EnemyProfile;
};

export function useCombatQuiz(opts: CombatEngineOptions) {
  const rules: CombatRules = useMemo(() => ({ ...DEFAULT_RULES, ...(opts.rules || {}),
    playerDamageByTier: { ...DEFAULT_RULES.playerDamageByTier, ...opts.rules?.playerDamageByTier },
    enemyDamageByTier: { ...DEFAULT_RULES.enemyDamageByTier, ...opts.rules?.enemyDamageByTier },
    xpByTier: { ...DEFAULT_RULES.xpByTier, ...opts.rules?.xpByTier },
    timePerQuestionByTier: { ...DEFAULT_RULES.timePerQuestionByTier, ...opts.rules?.timePerQuestionByTier },
  }), [opts.rules]);
  const timed = Boolean(opts.timed);
  const finishOnEnemyDefeat = opts.finishOnEnemyDefeat !== false;
  const questionsKey = useMemo(() => opts.questions.map((question) => question.id).join("|"), [opts.questions]);

  const onXpRef = useRef(opts.onXp);
  const onSubmitRef = useRef(opts.onSubmit);
  const onStateChangeRef = useRef(opts.onStateChange);
  const getActiveModifiersRef = useRef(opts.getActiveModifiers);
  const onConsumeModifierRef = useRef(opts.onConsumeModifier);
  const getQuestionLevelRef = useRef(opts.getQuestionLevel);
  const getXpMultiplierRef = useRef(opts.getXpMultiplier);
  const getXpBonusRef = useRef(opts.getXpBonus);
  const getPlayerDamageTakenRef = useRef(opts.getPlayerDamageTaken);
  const getEnemyDamageDealtRef = useRef(opts.getEnemyDamageDealt);
  const getHealOnCorrectRef = useRef(opts.getHealOnCorrect);
  useEffect(() => {
    onXpRef.current = opts.onXp;
    onSubmitRef.current = opts.onSubmit;
    onStateChangeRef.current = opts.onStateChange;
    getActiveModifiersRef.current = opts.getActiveModifiers;
    onConsumeModifierRef.current = opts.onConsumeModifier;
    getQuestionLevelRef.current = opts.getQuestionLevel;
    getXpMultiplierRef.current = opts.getXpMultiplier;
    getXpBonusRef.current = opts.getXpBonus;
    getPlayerDamageTakenRef.current = opts.getPlayerDamageTaken;
    getEnemyDamageDealtRef.current = opts.getEnemyDamageDealt;
    getHealOnCorrectRef.current = opts.getHealOnCorrect;
  }, [opts.onXp, opts.onSubmit, opts.onStateChange, opts.getActiveModifiers, opts.onConsumeModifier, opts.getQuestionLevel, opts.getXpMultiplier, opts.getXpBonus, opts.getPlayerDamageTaken, opts.getEnemyDamageDealt, opts.getHealOnCorrect]);

  function buildInitialState() {
    const base = initialCombatState(rules, timed);
    const question = opts.questions[Number(opts.initialState?.idx || 0)];
    const enemy = question && opts.getEnemyProfile?.(question);
    if (enemy) Object.assign(base, { enemyHP: enemy.maxHP, enemyMaxHP: enemy.maxHP, enemyTier: enemy.tier, enemyInventory: enemy.inventory });
    const restored = { ...base, ...(opts.initialState || {}) };
    restored.playerHP = clamp(restored.playerHP, 0, restored.playerMaxHP);
    restored.enemyHP = clamp(restored.enemyHP, 0, restored.enemyMaxHP);
    return restored;
  }

  const [state, setState] = useState<CombatState>(() => buildInitialState());
  const timerRef = useRef<number | null>(null);
  const timeoutResolvedRef = useRef<string | null>(null);
  const submittedKeysRef = useRef(new Set<string>());
  function reportOnce(key: string, result: SubmitResult, modifiers: CombatRuntimeModifiers, totalXp: number) {
    queueMicrotask(() => {
      if (submittedKeysRef.current.has(key)) return;
      submittedKeysRef.current.add(key);
      // Armed effects expire on this answer, even if the answer did not benefit.
      if (modifiers.shieldActive) onConsumeModifierRef.current?.("shieldActive");
      if (modifiers.furyActive) onConsumeModifierRef.current?.("furyActive");
      if (modifiers.timeWarpActive) onConsumeModifierRef.current?.("timeWarpActive");
      if (result.xpDelta > 0) onXpRef.current?.(result.xpDelta, totalXp);
      onSubmitRef.current?.(result);
    });
  }


  const resolveQuestionLevel = useCallback((question: CombatQuestion | undefined, combatState: CombatState) => {
    if (!question) return 1 as DifficultyTier;
    const resolved = getQuestionLevelRef.current?.(question, combatState);
    return (resolved === 1 || resolved === 2 || resolved === 3 || resolved === 4 || resolved === 5) ? resolved : inferLevel(question);
  }, []);

  const q = opts.questions[state.idx];

  useEffect(() => {
    submittedKeysRef.current.clear();
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
    const eff: DifficultyTier = lvl;
    const seconds = Math.ceil(rules.timePerQuestionByTier[eff] * (nextEnemyAbility(state.enemyInventory) === "time" ? 0.8 : 1));
    const savedTime = opts.initialState?.idx === state.idx ? opts.initialState?.timeLeft : undefined;
    startTimer(typeof savedTime === "number" && Number.isFinite(savedTime) ? clamp(savedTime, 0, seconds) : seconds);
  }, [q?.id, state.locked, state.finished, timed, rules.timePerQuestionByTier, startTimer, stopTimer, resolveQuestionLevel]);

  useEffect(() => {
    if (!timed || !q || state.finished || state.locked || state.timeLeft !== 0) return;
    const timeoutKey = `${state.idx}:${q.id || "q"}`;
    if (timeoutResolvedRef.current === timeoutKey) return;
    timeoutResolvedRef.current = timeoutKey;

    setState((s) => {
      if (s.locked || s.finished) return s;
      const domainId = inferDomainId(q);
      const lvl = resolveQuestionLevel(q, s);
      const effTier: DifficultyTier = lvl;

      const correct = false;
      const xpDelta = 0;
      const modifiers = getActiveModifiersRef.current?.() || {};
      const usedShield = Boolean(modifiers.shieldActive);
      const playerDamage = getPlayerDamageTakenRef.current?.({ question: q, state: s, tier: effTier, correct: false, usedShield }) ?? (usedShield ? 0 : rules.playerDamageByTier[effTier]);
      const playerHP = clamp(s.playerHP - Math.max(0, playerDamage), 0, s.playerMaxHP);
      const ability = nextEnemyAbility(s.enemyInventory);
      const enemyHP = clamp(s.enemyHP + (ability === "restore" && s.enemyHP > 0 ? Math.ceil(s.enemyMaxHP * 0.1) : 0), 0, s.enemyMaxHP);

      const prevMastery = s.mastery[domainId] ?? 0;
      const nextMastery = clamp(prevMastery - rules.masteryLossWrong, 0, 100);

      const mastery = { ...s.mastery, [domainId]: nextMastery };
      const avg = masteryAverage(mastery);
      const tier = computeTierFromMasteryAvg(avg, s.tier, rules);

      const next: CombatState = {
        ...s,
        playerHP,
        enemyHP,
        enemyInventory: consumeEnemyAbility(s.enemyInventory, ability),
        mastery,
        tier,
        locked: true,
        lastWasCorrect: false,
        feedback: "Time's up.",
      };

      reportOnce(`${s.idx}:${q.id}`, {
          correct,
          playerHP,
          enemyHP,
          xpDelta,
          tier,
          domainId,
          masteryValue: nextMastery,
          playerDamage: Math.max(0, s.playerHP - playerHP),
          enemyDamage: Math.max(0, s.enemyHP - enemyHP),
          playerHealing: Math.max(0, playerHP - s.playerHP),
          usedShield,
          usedFury: false,
        }, modifiers, next.xpEarned);

      return playerHP <= 0 ? { ...next, finished: true } : next;
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
      const effTier: DifficultyTier = lvl;
      const correct = s.selected === q.correctIndex;
      const modifiers = getActiveModifiersRef.current?.() || {};
      const usedShield = !correct && Boolean(modifiers.shieldActive);
      const usedFury = correct && Boolean(modifiers.furyActive);
      const baseXp = correct ? rules.xpByTier[effTier] : 0;
      const extraMultiplier = getXpMultiplierRef.current?.({ question: q, state: s, correct, baseXp }) ?? 1;
      const extraBonus = getXpBonusRef.current?.({ question: q, state: s, correct, baseXp }) ?? 0;
      const xpDelta = correct ? Math.max(0, Math.round(baseXp * (usedFury ? 1.5 : 1) * extraMultiplier) + extraBonus) : 0;

      const healOnCorrect = correct ? Math.max(0, getHealOnCorrectRef.current?.({ question: q, state: s, tier: effTier }) ?? 0) : 0;
      const playerDamage = correct ? 0 : (getPlayerDamageTakenRef.current?.({ question: q, state: s, tier: effTier, correct, usedShield }) ?? (usedShield ? 0 : rules.playerDamageByTier[effTier]));
      const enemyDamage = correct ? Math.max(0, getEnemyDamageDealtRef.current?.({ question: q, state: s, tier: effTier, correct, usedFury }) ?? (rules.enemyDamageByTier[effTier] * (usedFury ? 2 : 1))) : 0;
      const playerHP = clamp(correct ? s.playerHP + healOnCorrect : s.playerHP - Math.max(0, playerDamage), 0, s.playerMaxHP);
      const ability = nextEnemyAbility(s.enemyInventory);
      const enemyHP = clamp(correct ? s.enemyHP - enemyDamage : s.enemyHP + (ability === "restore" && s.enemyHP > 0 ? Math.ceil(s.enemyMaxHP * 0.1) : 0), 0, s.enemyMaxHP);

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
        enemyInventory: consumeEnemyAbility(s.enemyInventory, ability),
        mastery,
        tier,
        locked: true,
        lastWasCorrect: correct,
        correctCount: correct ? s.correctCount + 1 : s.correctCount,
        xpEarned: s.xpEarned + xpDelta,
        feedback: q.explanation || (correct ? "Direct hit." : s.timeLeft <= 0 ? "Time's up." : "Not quite."),
      };

      reportOnce(`${s.idx}:${q.id}`, {
          correct,
          playerHP,
          enemyHP,
          xpDelta,
          tier,
          domainId,
          masteryValue: nextMastery,
          playerDamage: Math.max(0, s.playerHP - playerHP),
          enemyDamage: Math.max(0, s.enemyHP - enemyHP),
          playerHealing: Math.max(0, playerHP - s.playerHP),
          usedShield,
          usedFury,
        }, modifiers, next.xpEarned);

      // A lethal wrong answer ends the run immediately. Previously defeat was
      // only finalized by next(), which left the quiz active at 0 HP.
      if (playerHP <= 0) {
        stopTimer();
        return { ...next, finished: true };
      }
      if (finishOnEnemyDefeat && enemyHP <= 0) {
        stopTimer();
        return { ...next, finished: true };
      }

      return next;
    });
  }, [q, rules, resolveQuestionLevel, finishOnEnemyDefeat, stopTimer]);

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
      const effTier: DifficultyTier = lvl;
      const correct = manual.correct;
      const modifiers = getActiveModifiersRef.current?.() || {};
      const usedShield = !correct && Boolean(modifiers.shieldActive);
      const usedFury = correct && Boolean(modifiers.furyActive);
      const baseXp = typeof manual.xpDelta === "number" ? manual.xpDelta : (correct ? rules.xpByTier[effTier] : 0);
      const extraMultiplier = getXpMultiplierRef.current?.({ question: q, state: s, correct, baseXp }) ?? 1;
      const extraBonus = getXpBonusRef.current?.({ question: q, state: s, correct, baseXp }) ?? 0;
      const xpDelta = correct ? Math.max(0, Math.round(baseXp * (usedFury ? 1.5 : 1) * extraMultiplier) + extraBonus) : 0;

      const healOnCorrect = correct ? Math.max(0, getHealOnCorrectRef.current?.({ question: q, state: s, tier: effTier }) ?? 0) : 0;
      const playerDamage = correct ? 0 : (getPlayerDamageTakenRef.current?.({ question: q, state: s, tier: effTier, correct, usedShield }) ?? (usedShield ? 0 : rules.playerDamageByTier[effTier]));
      const enemyDamage = correct ? Math.max(0, getEnemyDamageDealtRef.current?.({ question: q, state: s, tier: effTier, correct, usedFury }) ?? (rules.enemyDamageByTier[effTier] * (usedFury ? 2 : 1))) : 0;
      const playerHP = clamp(correct ? s.playerHP + healOnCorrect : s.playerHP - Math.max(0, playerDamage), 0, s.playerMaxHP);
      const ability = nextEnemyAbility(s.enemyInventory);
      const enemyHP = clamp(correct ? s.enemyHP - enemyDamage : s.enemyHP + (ability === "restore" && s.enemyHP > 0 ? Math.ceil(s.enemyMaxHP * 0.1) : 0), 0, s.enemyMaxHP);

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
        enemyInventory: consumeEnemyAbility(s.enemyInventory, ability),
        mastery,
        tier,
        locked: true,
        lastWasCorrect: correct,
        correctCount: correct ? s.correctCount + 1 : s.correctCount,
        xpEarned: s.xpEarned + xpDelta,
        feedback: manual.feedback ?? q.explanation ?? (correct ? "Direct hit." : "Not quite."),
      };

      reportOnce(`${s.idx}:${q.id}`, {
          correct,
          playerHP,
          enemyHP,
          xpDelta,
          tier,
          domainId,
          masteryValue: nextMastery,
          playerDamage: Math.max(0, s.playerHP - playerHP),
          enemyDamage: Math.max(0, s.enemyHP - enemyHP),
          playerHealing: Math.max(0, playerHP - s.playerHP),
          usedShield,
          usedFury,
        }, modifiers, next.xpEarned);

      // A lethal wrong answer ends the run immediately. Previously defeat was
      // only finalized by next(), which left the quiz active at 0 HP.
      if (playerHP <= 0) {
        stopTimer();
        return { ...next, finished: true };
      }
      if (finishOnEnemyDefeat && enemyHP <= 0) {
        stopTimer();
        return { ...next, finished: true };
      }

      return next;
    });
  }, [q, rules, resolveQuestionLevel, finishOnEnemyDefeat, stopTimer]);

  const next = useCallback(() => {
    stopTimer();
    setState((s) => {
      if (s.finished || !s.locked) return s;
      if (s.playerHP <= 0 || (finishOnEnemyDefeat && s.enemyHP <= 0)) return { ...s, finished: true };

      const nextIdx = s.idx + 1;
      if (nextIdx >= opts.questions.length) return { ...s, finished: true };

      const nextQ = opts.questions[nextIdx];
      const nextLvl = nextQ ? resolveQuestionLevel(nextQ, s) : 1;
      const effNextTier: DifficultyTier = nextLvl;
      const enemy = nextQ && opts.getEnemyProfile?.(nextQ);
      return {
        ...s,
        ...(enemy && enemy.tier !== s.enemyTier ? { enemyHP: enemy.maxHP, enemyMaxHP: enemy.maxHP, enemyTier: enemy.tier, enemyInventory: enemy.inventory } : {}),
        idx: nextIdx,
        selected: null,
        locked: false,
        feedback: null,
        lastWasCorrect: null,
        timeLeft: timed ? rules.timePerQuestionByTier[effNextTier] : s.timeLeft,
      };
    });
  }, [opts.questions, rules.timePerQuestionByTier, timed, stopTimer, resolveQuestionLevel, finishOnEnemyDefeat]);

  const addTime = useCallback((seconds: number) => {
    if (!seconds) return;
    setState((s) => s.finished || s.locked || !timed ? s : ({ ...s, timeLeft: Math.max(0, s.timeLeft + Math.floor(seconds)) }));
  }, [timed]);

  const restorePlayerHP = useCallback((amount: number) => {
    if (!amount) return;
    setState((s) => s.finished || s.playerHP <= 0 ? s : ({ ...s, playerHP: clamp(s.playerHP + Math.floor(amount), 0, s.playerMaxHP) }));
  }, [rules.startHP]);

  const restoreEnemyHP = useCallback((amount: number) => {
    setState(s => s.finished ? s : { ...s, enemyHP: clamp(s.enemyHP + amount, 0, s.enemyMaxHP) });
  }, [rules.startHP]);

  const revivePlayer = useCallback(() => {
    setState(s => s.finished && s.playerHP <= 0 ? { ...s, playerHP: Math.max(1, Math.ceil(s.playerMaxHP * 0.25)), finished: false } : s);
  }, []);

  const reset = useCallback(() => {
    stopTimer();
    submittedKeysRef.current.clear();
    setState(buildInitialState());
  }, [rules, timed, stopTimer]);

  const currentDomainId = useMemo(() => (q ? inferDomainId(q) : "general"), [q]);
  const currentMastery = state.mastery[currentDomainId] ?? 0;
  const masteryAvg = useMemo(() => masteryAverage(state.mastery), [state.mastery]);

  const outcome = useMemo(() => {
    if (!state.finished) return null;
    if (finishOnEnemyDefeat && state.enemyHP <= 0 && state.playerHP > 0) return "victory";
    if (state.playerHP <= 0) return "defeat";
    return "complete";
  }, [state.finished, state.enemyHP, state.playerHP, finishOnEnemyDefeat]);

  return {
    rules,
    state,
    question: q,
    select,
    clear,
    submit,
    submitManual,
    next,
    addTime,
    restorePlayerHP,
    restoreEnemyHP,
    revivePlayer,
    reset,
    timed,
    currentDomainId,
    currentMastery,
    masteryAvg,
    outcome,
  };
}
