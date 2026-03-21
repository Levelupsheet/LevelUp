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
  certExam?: string | null;
  enemyName?: string;
  questionCount?: number;
  onComplete?: (summary: DiabloQuizRunSummary & { awardedXp: number }) => void;
};

const FALLBACK_BY_LANE: Record<GameLane, DiabloQuestion[]> = {
  TEST_NOW: [{ id: "fallback_dns", type: "multiple_choice", prompt: "A user can reach 8.8.8.8 but not google.com. What should you troubleshoot first?", choices: ["DNS", "Monitor brightness", "Printer drivers", "Bluetooth"], correctIndex: 0, explanation: "The host can reach an IP, so name resolution is the likely problem.", domainId: "networking", level: 1 }],
  TRAINING: [{ id: "fallback_training", type: "multiple_choice", prompt: "No active training set is assigned. Where should you fix that?", choices: ["Admin placements", "Windows Update", "Task Manager", "Device Manager"], correctIndex: 0, explanation: "Assign a published question set to the training lane in Admin.", domainId: "general", level: 1 }],
  CERTIFICATIONS: [{ id: "fallback_cert", type: "multiple_choice", prompt: "No certification set is currently assigned. Where should you fix that?", choices: ["Admin placements", "Registry Editor", "Services", "Disk Management"], correctIndex: 0, explanation: "Assign a published question set to the certification lane in Admin.", domainId: "general", level: 1 }],
};

function getRecentKey(lane: GameLane, startingPosition?: string | null, certExam?: string | null) {
  return `lu_recent_${lane}_${startingPosition || "all"}_${certExam || "all"}`;
}
function readRecentIds(key: string): string[] { try { const raw = localStorage.getItem(key); const parsed = raw ? JSON.parse(raw) : []; return Array.isArray(parsed) ? parsed.map((v) => String(v)) : []; } catch { return []; } }
function writeRecentIds(key: string, ids: string[]) { try { const unique = Array.from(new Set(ids.map((v) => String(v)))).slice(-100); localStorage.setItem(key, JSON.stringify(unique)); } catch {} }

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
    level: q?.level === 3 || q?.difficulty === 3 ? 3 : q?.level === 2 || q?.difficulty === 2 ? 2 : 1,
    sessionQuestionId: q?.sessionQuestionId ? String(q.sessionQuestionId) : undefined,
    isGolden: Boolean(q?.isGolden),
  } as any;
}

export default function GameEngine(props: Props) {
  const { lane, title, subtitle, timed = false, exitHref = "/dashboard", exitLabel = "Close", onExit, metaLeft, metaRight, startingPosition, certExam, enemyName = "Lagger", questionCount, onComplete } = props;
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<DiabloQuestion[]>([]);
  const [setLabel, setSetLabel] = useState<string>(subtitle || title);
  const [sessionId, setSessionId] = useState<string>("");
  const [initialState, setInitialState] = useState<any>(null);
  const progressSaveRef = useRef<number | null>(null);

  const effectiveCount = useMemo(
    () => questionCount || (lane === "TEST_NOW" ? 10 : lane === "CERTIFICATIONS" ? GAME_CONFIG.questionCount.certification : GAME_CONFIG.questionCount.training),
    [lane, questionCount]
  );

  const loadStandard = useCallback(async () => {
    const search = new URLSearchParams();
    search.set("lane", lane);
    search.set("questionCount", String(effectiveCount));
    search.set("shuffle", "1");
    search.set("nonce", String(Date.now()));
    const recentKey = getRecentKey(lane, startingPosition, certExam);
    const excludeIds = readRecentIds(recentKey);
    if (excludeIds.length) search.set("excludeIds", excludeIds.join(","));
    if (startingPosition) search.set("startingPosition", startingPosition);
    if (certExam) search.set("certExam", certExam);
    const res = await fetch(`/api/content/active?${search.toString()}`, { cache: "no-store" as any });
    const json = await res.json().catch(() => null);
    const mapped = Array.isArray(json?.questions) ? json.questions.map(mapQuestion) : [];
    if (mapped.length) {
      setQuestions(mapped);
      writeRecentIds(recentKey, mapped.map((q) => String(q.id)));
      setSetLabel(json?.set?.name ? `${title} · ${json.set.name}` : subtitle || title);
    } else {
      setQuestions(FALLBACK_BY_LANE[lane]);
      setSetLabel(`${title} · Sample`);
    }
  }, [lane, effectiveCount, startingPosition, certExam, title, subtitle]);

  const loadTestNowSession = useCallback(async () => {
    const userId = resolveClientUserId();
    const res = await fetch("/api/test-now/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, questionCount: effectiveCount }),
      cache: "no-store" as any,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || "Failed to create Test Now session");
    const mapped = Array.isArray(json?.questions) ? json.questions.map(mapQuestion) : [];
    if (mapped.length) {
      setQuestions(mapped);
      setSessionId(String(json?.session?.id || ""));
      setInitialState(json?.session?.state || null);
      setSetLabel(json?.session?.goldenSpawned ? `${title} · Active Session` : `${title} · Active Session`);
    } else {
      setQuestions(FALLBACK_BY_LANE.TEST_NOW);
      setSetLabel(`${title} · Sample`);
    }
  }, [effectiveCount, title]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await hydrateAuthenticatedUser();
      if (lane === "TEST_NOW") await loadTestNowSession();
      else await loadStandard();
    } catch {
      setQuestions(FALLBACK_BY_LANE[lane]);
      setSetLabel(`${title} · Sample`);
    } finally {
      setLoading(false);
    }
  }, [lane, loadStandard, loadTestNowSession, title]);

  useEffect(() => { load(); }, [load]);

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

  const handleComplete = useCallback(async (summary: DiabloQuizRunSummary) => {
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
          lane,
          title,
          correctCount: summary.correctCount,
          totalQuestions: summary.totalQuestions,
          xpEarned: awardedXp,
          outcome: summary.outcome,
          masteryByDomain: summary.masteryByDomain || {},
          questionDomains: questions.map((q) => ({ id: String(q.id || ""), domainId: String(q.domainId || "general"), level: Number(q.level || 1) })),
        }),
      });
    } catch {}
    onComplete?.({ ...summary, awardedXp });
  }, [timed, lane, title, onComplete, sessionId, initialState]);

  if (loading) return <div className="page"><div className="container" style={{ maxWidth: 1280 }}><div className="card" style={{ padding: 18 }}><div style={{ fontWeight: 800, fontSize: 18 }}>Loading {title}…</div><div className="muted" style={{ marginTop: 8 }}>{lane === "TEST_NOW" ? "Restoring or creating your saved Test Now session." : "Pulling randomized questions from your active database set."}</div></div></div></div>;
  if (!questions.length) return <div className="page"><div className="container" style={{ maxWidth: 1120 }}><div className="card" style={{ padding: 18 }}><div style={{ fontWeight: 800, fontSize: 18 }}>No questions available</div><div className="muted" style={{ marginTop: 8 }}>Assign an active question set in Admin.</div><div style={{ marginTop: 14 }}><Link className="btn" href="/admin">Open Admin</Link></div></div></div></div>;

  return <DiabloQuizRunner title={title} subtitle={setLabel} enemyName={enemyName} questions={questions} timed={timed} metaLeft={metaLeft} metaRight={metaRight} exitHref={exitHref} exitLabel={exitLabel} onExit={onExit} onComplete={handleComplete} onStateChange={saveSessionProgress} onAdvanceQuestion={handleAdvanceQuestion} initialState={initialState} media={{ playerIdleSrc: "/video/player-idle.mp4", playerAttackSrc: "/video/player-attack.mp4", enemyIdleSrc: "/video/enemy-idle.mp4", enemyHitSrc: "/video/enemy-damage.mp4", width: 1600, height: 900 }} />;
}
