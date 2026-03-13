"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DiabloQuizRunner, { type DiabloQuestion, type DiabloQuizRunSummary } from "@/components/DiabloQuizRunner";
import { domainEnumToId, inferDomainFromQuestion } from "@/lib/learningProfile";
import { GAME_CONFIG } from "@/engine/constants/gameConfig";
import { calculateSpeedBonus } from "@/engine/systems/XPSystem";
import { awardXp, getActiveUser } from "@/lib/userStore";
import { addActivity } from "@/lib/activityStore";
import { hydrateAuthenticatedUser, resolveClientUserId } from "@/lib/activeUser";
import { normalizeQuestionType } from "@/lib/questionTypes";
import { bossAbilityLabel, bossCombatRules, type BossProfile } from "@/lib/bossBattle";

export type GameLane = "TRAINING" | "CERTIFICATIONS" | "TEST_NOW";

type BossEncounterPayload = {
  id: string;
  isGolden: boolean;
  bossName: string;
  bonusXp: number;
  raffleEntriesReward: number;
  questions: DiabloQuestion[];
  bossProfile?: BossProfile | null;
};

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
  const choices = Array.isArray(q?.choices) ? q.choices : Array.isArray((data as any)?.choices) ? (data as any).choices : [];
  const inferredDomain = inferDomainFromQuestion({ tags, prompt: q?.prompt, data, domain: q?.domainId || q?.domain, setDomain: q?.setDomain });

  return {
    id: q?.id || `question_${idx}`,
    prompt: String(q?.prompt || ""),
    type,
    choices,
    correctIndex: typeof q?.correctIndex === "number" ? q.correctIndex : typeof (data as any)?.correctIndex === "number" ? (data as any).correctIndex : null,
    data,
    explanation: q?.explanation ?? null,
    domainId: domainEnumToId(inferredDomain),
    level: q?.level === 3 || q?.difficulty === 3 ? 3 : q?.level === 2 || q?.difficulty === 2 ? 2 : 1,
    golden: Boolean(q?.golden),
    goldenMeta: q?.goldenMeta ?? null,
  };
}

export default function GameEngine(props: Props) {
  const { lane, title, subtitle, timed = false, exitHref = "/dashboard", exitLabel = "Close", onExit, metaLeft, metaRight, startingPosition, certExam, enemyName = "Lagger", questionCount, onComplete } = props;
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<DiabloQuestion[]>([]);
  const [setLabel, setSetLabel] = useState<string>(subtitle || title);
  const [bossEncounter, setBossEncounter] = useState<BossEncounterPayload | null>(null);
  const [bossIntroVisible, setBossIntroVisible] = useState(false);

  const effectiveCount = useMemo(() => questionCount || (lane === "TEST_NOW" ? GAME_CONFIG.questionCount.testNow : lane === "CERTIFICATIONS" ? GAME_CONFIG.questionCount.certification : GAME_CONFIG.questionCount.training), [lane, questionCount]);

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
  useEffect(() => {
    if (!bossIntroVisible) return;
    const timer = window.setTimeout(() => setBossIntroVisible(false), 1800);
    return () => window.clearTimeout(timer);
  }, [bossIntroVisible]);

  const handleComplete = useCallback(async (summary: DiabloQuizRunSummary) => {
    const speedBonus = timed ? calculateSpeedBonus(summary.timeLeft || 0) : 0;
    const awardedXp = summary.xpEarned + speedBonus;
    const hintXpSpent = Number(summary.hintXpSpent || 0);
    const netXpDelta = awardedXp - hintXpSpent;
    const local = awardXp(netXpDelta);
    const activeUserId = resolveClientUserId();
    try {
      const localUser = local || getActiveUser();
      addActivity(localUser.id, { type: `GAME_${lane}_COMPLETE`, title: `${title} complete`, body: `Score ${summary.correctCount}/${summary.totalQuestions} • +${awardedXp} XP` });
    } catch {}

    let bossPayload: BossEncounterPayload | null = null;
    try {
      const response = await fetch("/api/game/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: activeUserId,
          lane,
          title,
          startingPosition,
          certExam,
          correctCount: summary.correctCount,
          totalQuestions: summary.totalQuestions,
          xpEarned: awardedXp,
          hintXpSpent,
          hintsUsedCount: summary.hintsUsedCount,
          hintsUsed: summary.hintsUsed,
          netXpDelta,
          outcome: summary.outcome,
          answerEvents: summary.answerEvents,
          domainMastery: summary.domainMastery,
          goldenQuestionSeen: summary.goldenQuestionSeen,
          goldenQuestionCorrect: summary.goldenQuestionCorrect,
        }),
      });
      const json = await response.json().catch(() => null);
      if (json?.bossEncounter?.questions?.length) {
        bossPayload = { ...json.bossEncounter, questions: json.bossEncounter.questions.map(mapQuestion) };
      }
    } catch {}

    if (bossPayload) {
      setBossEncounter(bossPayload);
      setBossIntroVisible(true);
    } else {
      onComplete?.({ ...summary, awardedXp: netXpDelta });
    }
  }, [timed, lane, title, onComplete, startingPosition, certExam]);

  const handleBossComplete = useCallback(async (summary: DiabloQuizRunSummary) => {
    const activeUserId = resolveClientUserId();
    let bonusXpAwarded = 0;
    let raffleEntriesAwarded = 0;
    try {
      const response = await fetch("/api/game/boss-complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          encounterId: bossEncounter?.id,
          userId: activeUserId,
          outcome: summary.outcome,
          xpEarned: summary.xpEarned,
          hintXpSpent: summary.hintXpSpent,
          hintsUsedCount: summary.hintsUsedCount,
          hintsUsed: summary.hintsUsed,
          correctCount: summary.correctCount,
          totalQuestions: summary.totalQuestions,
          answerEvents: summary.answerEvents,
        }),
      });
      const json = await response.json().catch(() => null);
      bonusXpAwarded = Number(json?.bonusXpAwarded || 0);
      raffleEntriesAwarded = Number(json?.raffleEntriesAwarded || 0);
    } catch {}

    const hintXpSpent = Number(summary.hintXpSpent || 0);
    const totalAwardedXp = summary.xpEarned + bonusXpAwarded - hintXpSpent;
    if (totalAwardedXp !== 0) {
      const local = awardXp(totalAwardedXp);
      try {
        const localUser = local || getActiveUser();
        addActivity(localUser.id, { type: bossEncounter?.isGolden ? "GOLDEN_BOSS_VICTORY" : "BOSS_BATTLE_COMPLETE", title: bossEncounter?.isGolden ? "Golden boss battle finished" : "Boss battle finished", body: `Score ${summary.correctCount}/${summary.totalQuestions} • ${totalAwardedXp >= 0 ? `+${totalAwardedXp}` : totalAwardedXp} XP${hintXpSpent > 0 ? ` • hints -${hintXpSpent}` : ""}${raffleEntriesAwarded > 0 ? ` • +${raffleEntriesAwarded} raffle entries` : ""}` });
      } catch {}
    }

    onComplete?.({ ...summary, awardedXp: totalAwardedXp });
  }, [bossEncounter, onComplete]);

  if (loading) return <div className="page"><div className="container" style={{ maxWidth: 1280 }}><div className="card" style={{ padding: 18 }}><div style={{ fontWeight: 800, fontSize: 18 }}>Loading {title}…</div><div className="muted" style={{ marginTop: 8 }}>Pulling randomized questions from your active database set.</div></div></div></div>;
  if (!questions.length) return <div className="page"><div className="container" style={{ maxWidth: 1120 }}><div className="card" style={{ padding: 18 }}><div style={{ fontWeight: 800, fontSize: 18 }}>No questions available</div><div className="muted" style={{ marginTop: 8 }}>Assign an active question set in Admin.</div><div style={{ marginTop: 14 }}><Link className="btn" href="/admin">Open Admin</Link></div></div></div></div>;

  if (bossEncounter) {
    return (
      <div style={{ position: "relative" }}>
        {bossIntroVisible ? (
          <div style={{ position: "absolute", inset: 0, zIndex: 6, display: "grid", placeItems: "center", pointerEvents: "none" }}>
            <div className="card" style={{ padding: 24, border: bossEncounter.isGolden ? "2px solid rgba(245,204,74,0.85)" : "2px solid rgba(149,76,233,0.75)", background: bossEncounter.isGolden ? "rgba(35,28,8,0.88)" : "rgba(18,8,35,0.88)", boxShadow: bossEncounter.isGolden ? "0 0 30px rgba(245,204,74,0.35)" : "0 0 26px rgba(149,76,233,0.26)" }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.2, opacity: 0.8 }}>SESSION COMPLETE</div>
              <div style={{ marginTop: 8, fontSize: 28, fontWeight: 950 }}>{bossEncounter.isGolden ? "✨ GOLDEN BOSS ✨" : "⚔️ BOSS BATTLE ⚔️"}</div>
              <div className="muted" style={{ marginTop: 6 }}>{bossEncounter.bossName} enters the arena.</div>
              {bossEncounter.bossProfile ? <div className="muted" style={{ marginTop: 6 }}>Target domain: {String(bossEncounter.bossProfile.targetDomain || "general").toUpperCase()} • Abilities: {bossEncounter.bossProfile.abilities.map(bossAbilityLabel).join(" • ")}</div> : null}
            </div>
          </div>
        ) : null}

        <DiabloQuizRunner
          title={bossEncounter.isGolden ? "Golden Boss Battle" : "Boss Battle"}
          subtitle={`${bossEncounter.bossName} • 3 high-difficulty questions`}
          enemyName={bossEncounter.bossName}
          questions={bossEncounter.questions}
          timed={false}
          metaLeft={bossEncounter.isGolden ? "Golden Boss" : "Boss Battle"}
          metaRight={bossEncounter.isGolden ? `Raffle +${bossEncounter.raffleEntriesReward}` : `Bonus XP +${bossEncounter.bonusXp}`}
          exitHref={exitHref}
          exitLabel={exitLabel}
          onExit={onExit}
          onComplete={handleBossComplete}
          bossMode
          goldenBoss={bossEncounter.isGolden}
          rules={bossCombatRules(bossEncounter.bossProfile)}
          bossProfile={bossEncounter.bossProfile || undefined}
          media={{ playerIdleSrc: "/video/player-idle.mp4", playerAttackSrc: "/video/player-attack.mp4", enemyIdleSrc: "/video/enemy-idle.mp4", enemyHitSrc: "/video/enemy-damage.mp4", width: 1320, height: 820 }}
        />
      </div>
    );
  }

  return <DiabloQuizRunner title={title} subtitle={setLabel} enemyName={enemyName} questions={questions} timed={timed} metaLeft={metaLeft} metaRight={metaRight} exitHref={exitHref} exitLabel={exitLabel} onExit={onExit} onComplete={handleComplete} media={{ playerIdleSrc: "/video/player-idle.mp4", playerAttackSrc: "/video/player-attack.mp4", enemyIdleSrc: "/video/enemy-idle.mp4", enemyHitSrc: "/video/enemy-damage.mp4", width: 1240, height: 760 }} />;
}
