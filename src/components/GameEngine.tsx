"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
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
    domainId: tags[0] ? String(tags[0]).toLowerCase() : undefined,
    level: q?.level === 3 || q?.difficulty === 3 ? 3 : q?.level === 2 || q?.difficulty === 2 ? 2 : 1,
  };
}

export default function GameEngine(props: Props) {
  const { lane, title, subtitle, timed = false, exitHref = "/dashboard", exitLabel = "Close", onExit, metaLeft, metaRight, startingPosition, certExam, enemyName = "Lagger", questionCount, onComplete } = props;
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<DiabloQuestion[]>([]);
  const [setLabel, setSetLabel] = useState<string>(subtitle || title);

  const effectiveCount = useMemo(
    () => questionCount || (lane === "TEST_NOW" ? GAME_CONFIG.questionCount.testNow : lane === "CERTIFICATIONS" ? GAME_CONFIG.questionCount.certification : GAME_CONFIG.questionCount.training),
    [lane, questionCount]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await hydrateAuthenticatedUser();
      const search = new URLSearchParams();
      search.set("lane", lane);
      search.set("questionCount", String(effectiveCount));
      search.set("shuffle", "1");
      if (startingPosition) search.set("startingPosition", startingPosition);
      if (certExam) search.set("certExam", certExam);
      const res = await fetch(`/api/content/active?${search.toString()}`, { cache: "no-store" as any });
      const json = await res.json().catch(() => null);
      const mapped = Array.isArray(json?.questions) ? json.questions.map(mapQuestion) : [];
      if (mapped.length) {
        setQuestions(mapped);
        setSetLabel(json?.set?.name ? `${title} · ${json.set.name}` : subtitle || title);
      } else {
        setQuestions(FALLBACK_BY_LANE[lane]);
        setSetLabel(`${title} · Sample`);
      }
    } catch {
      setQuestions(FALLBACK_BY_LANE[lane]);
      setSetLabel(`${title} · Sample`);
    } finally {
      setLoading(false);
    }
  }, [lane, effectiveCount, startingPosition, certExam, title, subtitle]);

  useEffect(() => { load(); }, [load]);

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
      await fetch("/api/game/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: activeUserId, lane, title, correctCount: summary.correctCount, totalQuestions: summary.totalQuestions, xpEarned: awardedXp, outcome: summary.outcome }),
      });
    } catch {}
    onComplete?.({ ...summary, awardedXp });
  }, [timed, lane, title, onComplete]);

  if (loading) return <div className="page"><div className="container" style={{ maxWidth: 1280 }}><div className="card" style={{ padding: 18 }}><div style={{ fontWeight: 800, fontSize: 18 }}>Loading {title}…</div><div className="muted" style={{ marginTop: 8 }}>Pulling randomized questions from your active database set.</div></div></div></div>;
  if (!questions.length) return <div className="page"><div className="container" style={{ maxWidth: 1120 }}><div className="card" style={{ padding: 18 }}><div style={{ fontWeight: 800, fontSize: 18 }}>No questions available</div><div className="muted" style={{ marginTop: 8 }}>Assign an active question set in Admin.</div><div style={{ marginTop: 14 }}><Link className="btn" href="/admin">Open Admin</Link></div></div></div></div>;

  return <DiabloQuizRunner title={title} subtitle={setLabel} enemyName={enemyName} questions={questions} timed={timed} metaLeft={metaLeft} metaRight={metaRight} exitHref={exitHref} exitLabel={exitLabel} onExit={onExit} onComplete={handleComplete} media={{ playerIdleSrc: "/video/player-idle.mp4", playerAttackSrc: "/video/player-attack.mp4", enemyIdleSrc: "/video/enemy-idle.mp4", width: 1240, height: 760 }} />;
}
