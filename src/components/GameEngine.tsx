"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import DiabloQuizRunner, { type DiabloQuestion, type DiabloQuizRunSummary } from "@/components/DiabloQuizRunner";
import { GAME_CONFIG } from "@/engine/constants/gameConfig";
import { calculateSpeedBonus } from "@/engine/systems/XPSystem";
import { awardXp, getActiveUser } from "@/lib/userStore";
import { addActivity } from "@/lib/activityStore";
import { hydrateAuthenticatedUser, resolveClientUserId } from "@/lib/activeUser";
import { normalizeQuestionType } from "@/lib/questionTypes";

export type GameLane = "TRAINING" | "CERTIFICATIONS" | "TEST_NOW";

type Props = {
  lane: GameLane;
  title: string;
  subtitle?: string;
  timed?: boolean;
  exitHref?: string;
  exitLabel?: string;
  onExit?: () => void;
  metaLeft?: string;
  metaRight?: string;
  startingPosition?: string | null;
  industry?: string | null;
  careerPath?: string | null;
  playerPosition?: string | null;
  certExam?: string | null;
  bankDomain?: string | null;
  trainingMode?: "STANDARD" | "WEAK_DOMAIN" | "MISSED_QUESTIONS";
  enemyName?: string;
  questionCount?: number;
  questionsOverride?: DiabloQuestion[] | null;
  rulesOverride?: any;
  onComplete?: (summary: DiabloQuizRunSummary & { awardedXp: number }) => void;
  encounterType?: "standard" | "boss";
};


function getRecentKey(lane: GameLane, selection: string) {
  return `lu_recent_${lane}_${selection}`;
}
function readRecentIds(key: string): string[] { try { const raw = localStorage.getItem(key); const parsed = raw ? JSON.parse(raw) : []; return Array.isArray(parsed) ? parsed.map((v) => String(v)) : []; } catch { return []; } }
function writeRecentIds(key: string, ids: string[]) { try { const unique = Array.from(new Set(ids.map((v) => String(v)))); localStorage.setItem(key, JSON.stringify(unique)); } catch {} }

function mapQuestion(q: any, idx: number): DiabloQuestion {
  const tags = Array.isArray(q?.tags) ? q.tags : [];
  const type = normalizeQuestionType(q?.type);
  const data = q?.data && typeof q.data === "object" ? q.data : {};
  const choices = Array.isArray(q?.choices)
    ? q.choices
    : Array.isArray((data as any)?.choices)
      ? (data as any).choices
      : [];

  return {
    id: q?.id || `question_${idx}`,
    prompt: String(q?.prompt || ""),
    type,
    choices,
    correctIndex: typeof q?.correctIndex === "number" ? q.correctIndex : typeof (data as any)?.correctIndex === "number" ? (data as any).correctIndex : null,
    data,
    explanation: q?.explanation ?? null,
    domainId: q?.domainId || (tags[0] ? String(tags[0]).toLowerCase() : undefined),
    level: Math.max(1, Math.min(5, Number(q?.level ?? q?.difficulty ?? 1) || 1)),
    sessionQuestionId: q?.sessionQuestionId ? String(q.sessionQuestionId) : undefined,
    isGolden: Boolean(q?.isGolden),
  } as any;
}

export default function GameEngine(props: Props) {
  const { lane, title, subtitle, timed = false, exitHref = "/dashboard", exitLabel = "Close", onExit, metaLeft, metaRight, startingPosition, industry, careerPath, playerPosition, certExam, bankDomain, trainingMode = "STANDARD", enemyName = "Lagger", questionCount, questionsOverride, rulesOverride, onComplete, encounterType = questionsOverride?.length ? "boss" : "standard" } = props;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<DiabloQuestion[]>([]);
  const [setLabel, setSetLabel] = useState<string>(subtitle || title);
  const [sessionId, setSessionId] = useState<string>("");
  const [initialState, setInitialState] = useState<any>(null);
  const rewardClaimKeyRef = useRef("");
  const progressSaveRef = useRef<number | null>(null);

  const effectiveCount = useMemo(
    () => questionCount || (lane === "TEST_NOW" ? GAME_CONFIG.questionCount.testNow : lane === "CERTIFICATIONS" ? GAME_CONFIG.questionCount.certification : GAME_CONFIG.questionCount.training),
    [lane, questionCount]
  );

  const loadStandard = useCallback(async () => {
    const search = new URLSearchParams();
    search.set("lane", lane);
    search.set("questionCount", String(effectiveCount));
    search.set("shuffle", "1");
    search.set("nonce", String(Date.now()));
    const recentKey = getRecentKey(lane, careerPath ? `${industry || ""}:${careerPath}` : startingPosition || certExam || bankDomain || "all");
    const recentIds = readRecentIds(recentKey);
    if (recentIds.length) search.set("excludeIds", recentIds.join(","));
    if (careerPath) {
      search.set("careerPath", careerPath);
      if (industry) search.set("industry", industry);
    } else if (startingPosition) search.set("startingPosition", startingPosition);
    if (certExam) search.set("certExam", certExam);
    if (bankDomain) search.set("bankDomain", bankDomain);
    let res = await fetch(`/api/content/active?${search.toString()}`, { cache: "no-store" });
    let json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || "Could not load published questions");
    let previousIds = recentIds;
    // Finish the unseen remainder first. Reopen the bank only when none remain.
    if (!json?.questions?.length && recentIds.length) {
      search.delete("excludeIds");
      res = await fetch(`/api/content/active?${search.toString()}`, { cache: "no-store" });
      json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Could not load published questions");
      previousIds = [];
    }
    const mapped = Array.isArray(json?.questions) ? json.questions.map(mapQuestion) : [];
    if (mapped.length) {
      setQuestions(mapped);
      writeRecentIds(recentKey, [...previousIds, ...mapped.map((q) => String(q.id))]);
      setSetLabel(json?.set?.name ? `${title} · ${json.set.name}` : subtitle || title);
    } else {
      setQuestions([]);
      setLoadError("No published questions are available for this training selection. Assign a question pool in Admin → Question Pools.");
    }
  }, [lane, effectiveCount, startingPosition, industry, careerPath, certExam, bankDomain, title, subtitle]);

  const loadTestNowSession = useCallback(async () => {
    const userId = resolveClientUserId();
    const res = await fetch("/api/test-now/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, questionCount: effectiveCount, bankDomain, trainingMode }),
      cache: "no-store" as any,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || "Failed to create Test Now session");
    const mapped = Array.isArray(json?.questions) ? json.questions.map(mapQuestion) : [];
    if (mapped.length) {
      setQuestions(mapped);
      setSessionId(String(json?.session?.id || ""));
      setInitialState(json?.session?.state || null);
      const focus = String(json?.session?.state?.focusDomain || "").replace(/_/g, " ");
      setSetLabel(trainingMode === "WEAK_DOMAIN" ? `${title} · Weak Domain${focus ? `: ${focus}` : ""}` : trainingMode === "MISSED_QUESTIONS" ? `${title} · Missed Question Review` : `${title} · Active Session`);
    } else {
      setQuestions([]);
      setLoadError("No questions are available for this Test Now selection. Check the published database pools.");
    }
  }, [effectiveCount, title, bankDomain, trainingMode]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    rewardClaimKeyRef.current = crypto.randomUUID();
    try {
      await hydrateAuthenticatedUser();
      if (lane === "TEST_NOW") await loadTestNowSession();
      else await loadStandard();
    } catch (error: any) {
      setQuestions([]);
      setLoadError(error?.message || "Could not load questions from the database.");
    } finally {
      setLoading(false);
    }
  }, [lane, loadStandard, loadTestNowSession, title]);

  useEffect(() => {
    if (questionsOverride?.length) {
      rewardClaimKeyRef.current = crypto.randomUUID();
      setQuestions(questionsOverride);
      setSetLabel(subtitle || title);
      setLoading(false);
      return;
    }
    load();
  }, [load, questionsOverride, subtitle, title]);

  const saveSessionProgress = useCallback((state: any) => {
    if (lane !== "TEST_NOW" || !sessionId) return;
    if (progressSaveRef.current) window.clearTimeout(progressSaveRef.current);
    progressSaveRef.current = window.setTimeout(async () => {
      try {
        await fetch("/api/test-now/session", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId, currentIndex: Number(state?.idx || 0), state }),
        });
      } catch {}
    }, 250) as any;
  }, [lane, sessionId]);


  const handleAdvanceQuestion = useCallback(async (payload: { question: any; isCorrect: boolean | null; selectedAnswer?: any; nextIndex: number; stateSnapshot?: any }) => {
    if (lane !== "TEST_NOW" || !sessionId || !payload?.question?.sessionQuestionId) return { goldenAwarded: false };
    try {
      const res = await fetch("/api/test-now/session", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          currentIndex: payload.nextIndex,
          state: payload.stateSnapshot,
          answeredQuestions: [{
            sessionQuestionId: payload.question.sessionQuestionId,
            isCorrect: payload.isCorrect,
            selectedAnswer: payload.selectedAnswer,
          }],
        }),
      });
      const json = await res.json().catch(() => null);
      return { goldenAwarded: Boolean(json?.goldenAwarded) };
    } catch {
      return { goldenAwarded: false };
    }
  }, [lane, sessionId]);

  useEffect(() => () => { if (progressSaveRef.current) window.clearTimeout(progressSaveRef.current); }, []);

  const handleComplete = useCallback(async (summary: DiabloQuizRunSummary) => {
    if (progressSaveRef.current) { window.clearTimeout(progressSaveRef.current); progressSaveRef.current = null; }
    const speedBonus = timed ? calculateSpeedBonus(summary.timeLeft || 0) : 0;
    const awardedXp = summary.xpEarned + speedBonus;
    const local = awardXp(awardedXp);
    const activeUserId = resolveClientUserId();
    try {
      const localUser = local || getActiveUser();
      addActivity(localUser.id, { type: `GAME_${lane}_COMPLETE`, title: `${title} complete`, body: `Score ${summary.correctCount}/${summary.totalQuestions} • +${awardedXp} XP` });
    } catch {}
    try {
      if (lane === "TEST_NOW" && sessionId) {
        await fetch("/api/test-now/session", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId, status: "COMPLETED", currentIndex: summary.totalQuestions, state: { ...initialState, finished: true } }) });
      }
      await fetch("/api/game/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: activeUserId,
          rewardClaimKey: sessionId || rewardClaimKeyRef.current,
          lane,
          title,
          correctCount: summary.correctCount,
          totalQuestions: summary.totalQuestions,
          xpEarned: awardedXp,
          outcome: summary.outcome,
          bestStreak: summary.bestStreak || 0,
          encounterType,
          masteryByDomain: summary.masteryByDomain || {},
          questionDomains: questions.map((q) => ({ id: String(q.id || ""), domainId: String(q.domainId || "general"), level: Number(q.level || 1) })),
        }),
      });
    } catch {}
    onComplete?.({ ...summary, awardedXp });
  }, [timed, lane, title, onComplete, sessionId, initialState, questions]);

  if (loading) return <div className="page"><div className="container" style={{ maxWidth: 1280 }}><div className="card" style={{ padding: 18 }}><div style={{ fontWeight: 800, fontSize: 18 }}>Loading {title}…</div><div className="muted" style={{ marginTop: 8 }}>{lane === "TEST_NOW" ? "Restoring or creating your saved Test Now session." : "Pulling randomized questions from your active database set."}</div></div></div></div>;
  const activePosition = playerPosition || String((getActiveUser() as any)?.startingPosition || "HELPDESK_SUPPORT");
  const careerPlayerName = careerPath
    ? String(careerPath).trim()
    : activePosition === "CLOUD_ENGINEER" ? "Cloud Assassin"
      : activePosition === "DESKTOP_TECHNICIAN" ? "Desktop Barbarian"
        : "Help Desk Wizard";
  const playerMedia = activePosition === "CLOUD_ENGINEER"
    ? { playerIdleSrc: "/video/T2V diablo 4 assassin Idle.mp4", playerAttackSrc: "/video/I2V diablo 4 assassin attack.mp4", playerHitSrc: "/video/T2V diablo 4 assassin damage.mp4" }
    : activePosition === "DESKTOP_TECHNICIAN"
      ? { playerIdleSrc: "/video/desktop-barbarian-idle.mp4", playerAttackSrc: "/video/desktop-barbarian-attack.mp4", playerHitSrc: "/video/desktop-barbarian-hit.mp4?v=20260927b" }
      : { playerIdleSrc: "/video/helpdesk-wizard-idle.mp4", playerAttackSrc: "/video/player-attack.mp4", playerHitSrc: "/video/helpdesk-wizard-hit.mp4" };

  if (!questions.length) return <div className="page"><div className="container" style={{ maxWidth: 1120 }}><div className="card" style={{ padding: 18 }}><div style={{ fontWeight: 800, fontSize: 18 }}>No questions available</div><div className="muted" style={{ marginTop: 8 }}>{loadError || "Assign an active question set in Admin."}</div><div style={{ marginTop: 14 }}><Link className="btn" href="/admin">Open Admin</Link></div></div></div></div>;

  return <DiabloQuizRunner title={title} subtitle={setLabel} enemyName={enemyName} playerDisplayName={careerPlayerName} questions={questions} timed={timed} metaLeft={metaLeft || `Adaptive lane: ${lane.replaceAll("_", " ")}`} metaRight={metaRight || `${questions.length} questions loaded`} exitHref={exitHref} exitLabel={exitLabel} onExit={onExit} onComplete={handleComplete} onStateChange={saveSessionProgress} onAdvanceQuestion={handleAdvanceQuestion} initialState={initialState} rules={rulesOverride} encounterType={encounterType} media={{ ...playerMedia, enemyIdleSrc: "/video/enemy-idle.mp4", enemyHitSrc: "/video/enemy-damage.mp4", width: 1600, height: 900 }} />;
}
