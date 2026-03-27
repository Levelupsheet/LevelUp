
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DiabloQuizRunner, { type DiabloQuestion, type DiabloQuizRunSummary } from "@/components/DiabloQuizRunner";

type LeaderRow = { userId: string; displayName: string; xp?: number; level?: number; rank?: string };
type PvpChallengeView = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  questionCount: number;
  challenger: { userId: string; displayName: string };
  rival: { userId: string; displayName: string };
  questions: Array<{
    id: string;
    prompt: string;
    type: string;
    choices?: string[];
    data?: Record<string, any>;
    explanation?: string | null;
  }>;
  you?: string | null;
  youSubmitted?: boolean;
  opponentSubmitted?: boolean;
  acceptedBy?: string | null;
  acceptedAt?: string | null;
  submissions?: Record<string, { summary: { correctCount: number; totalQuestions: number; accuracy: number; bestStreak: number; totalTimeMs: number; completedAt: string; awardedTokens?: number } }>;
  winnerUserId?: string | null;
  resultLabel?: string | null;
};

function getActiveUser() {
  if (typeof window === "undefined") return { id: "", displayName: "" };
  try {
    const activeId =
      localStorage.getItem("lu_active_user_id") ||
      localStorage.getItem("activeUserId") ||
      "";
    const users = JSON.parse(localStorage.getItem("lu_users") || "[]");
    const found = Array.isArray(users) ? users.find((u: any) => u?.id === activeId) : null;
    return {
      id: found?.id || activeId,
      displayName: found?.displayName || activeId || "Player",
    };
  } catch {
    return { id: "", displayName: "" };
  }
}

function formatMs(ms: number) {
  const seconds = Math.max(0, Math.floor((ms || 0) / 1000));
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${mins}:${String(rem).padStart(2, "0")}`;
}

function toDiabloQuestions(rows: PvpChallengeView["questions"]): DiabloQuestion[] {
  return (rows || []).map((q, i) => ({
    id: q.id || `pvp_q_${i}`,
    prompt: q.prompt,
    type: q.type as any,
    choices: q.choices,
    data: q.data,
    explanation: q.explanation,
    domainId: String((q.data as any)?.domainId || (q.data as any)?.domain || "pvp").toLowerCase(),
    level: Number((q.data as any)?.level || 1) as any,
  }));
}

export default function PvpPage() {
  const [activeUser, setActiveUser] = useState<{ id: string; displayName: string }>({ id: "", displayName: "" });
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [selectedRival, setSelectedRival] = useState<LeaderRow | null>(null);
  const [incoming, setIncoming] = useState<PvpChallengeView[]>([]);
  const [outgoing, setOutgoing] = useState<PvpChallengeView[]>([]);
  const [completed, setCompleted] = useState<PvpChallengeView[]>([]);
  const [activeChallenge, setActiveChallenge] = useState<PvpChallengeView | null>(null);
  const [duelOpen, setDuelOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const answerRef = useRef<Record<string, unknown>>({});
  const startedAtRef = useRef<number>(0);

  const userId = activeUser.id;
  const currentOpponentName = activeChallenge
    ? (activeChallenge.challenger.userId === userId ? activeChallenge.rival.displayName : activeChallenge.challenger.displayName)
    : "Lagger";

  async function loadBoardAndChallenges(targetChallengeId?: string) {
    const user = getActiveUser();
    setActiveUser(user);
    setLoading(true);
    setError("");
    try {
      const [leaderRes, challengeRes] = await Promise.all([
        fetch("/api/leaderboard/top?metric=top", { cache: "no-store" }),
        user.id ? fetch(`/api/pvp/challenges?userId=${encodeURIComponent(user.id)}`, { cache: "no-store" }) : Promise.resolve(null as any),
      ]);
      const leaderJson = leaderRes.ok ? await leaderRes.json() : { top: [] };
      const nextLeaders = (Array.isArray(leaderJson?.top) ? leaderJson.top : [])
        .map((row: any) => ({
          userId: String(row?.id || row?.userId || ""),
          displayName: String(row?.displayName || row?.id || "Player"),
          xp: Number(row?.xp || 0),
          level: Number(row?.level || 1),
          rank: String(row?.rank || "Student"),
        }))
        .filter((row: LeaderRow) => row.userId && row.userId !== user.id);
      setLeaders(nextLeaders);

      if (challengeRes && challengeRes.ok) {
        const json = await challengeRes.json();
        const nextIncoming = Array.isArray(json?.incoming) ? json.incoming : [];
        const nextOutgoing = Array.isArray(json?.outgoing) ? json.outgoing : [];
        const nextCompleted = Array.isArray(json?.completed) ? json.completed : [];
        setIncoming(nextIncoming);
        setOutgoing(nextOutgoing);
        setCompleted(nextCompleted);
        const all = [...nextIncoming, ...nextOutgoing, ...nextCompleted];
        const picked = targetChallengeId ? all.find((row: any) => row.id === targetChallengeId) : activeChallenge ? all.find((row: any) => row.id === activeChallenge.id) : null;
        if (picked) setActiveChallenge(picked);
      }
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to load PvP arena."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBoardAndChallenges();
  }, []);

  async function createChallenge() {
    if (!userId || !selectedRival) {
      setError("Choose a rival first.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/pvp/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengerId: userId,
          challengerName: activeUser.displayName,
          rivalId: selectedRival.userId,
          rivalName: selectedRival.displayName,
          questionCount: 6,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || json?.error || "Failed to create challenge");
      const challenge = json?.challenge;
      if (challenge) {
        setActiveChallenge(challenge);
        setDuelOpen(true);
        answerRef.current = {};
        startedAtRef.current = Date.now();
      }
      await loadBoardAndChallenges(challenge?.id);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setCreating(false);
    }
  }

  async function openChallenge(id: string, autoOpen = false) {
    if (!userId) return;
    setError("");
    try {
      const res = await fetch(`/api/pvp/challenges/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || json?.error || "Failed to load challenge");
      setActiveChallenge(json?.challenge || null);
      if (autoOpen && json?.challenge && !json.challenge.youSubmitted) {
        setDuelOpen(true);
        answerRef.current = {};
        startedAtRef.current = Date.now();
      }
    } catch (err: any) {
      setError(String(err?.message || err));
    }
  }

  async function acceptChallenge(id: string) {
    if (!userId) return;
    setError("");
    try {
      const res = await fetch(`/api/pvp/challenges/${encodeURIComponent(id)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || json?.error || "Failed to accept challenge");
      setActiveChallenge(json?.challenge || null);
      setDuelOpen(true);
      answerRef.current = {};
      startedAtRef.current = Date.now();
      await loadBoardAndChallenges(id);
    } catch (err: any) {
      setError(String(err?.message || err));
    }
  }

  async function submitChallenge(summary: DiabloQuizRunSummary) {
    if (!activeChallenge || !userId) return;
    setSubmitting(true);
    setError("");
    try {
      const payloadAnswers = activeChallenge.questions.map((q) => answerRef.current[q.id] ?? null);
      const totalTimeMs = startedAtRef.current ? Date.now() - startedAtRef.current : ((summary.totalQuestions || 0) * 1000);
      const res = await fetch(`/api/pvp/challenges/${encodeURIComponent(activeChallenge.id)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, answers: payloadAnswers, totalTimeMs }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || json?.error || "Failed to submit challenge");
      setActiveChallenge(json?.challenge || null);
      setDuelOpen(false);
      await loadBoardAndChallenges(activeChallenge.id);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setSubmitting(false);
    }
  }

  const youSummary = useMemo(() => (activeChallenge?.submissions && userId ? activeChallenge.submissions[userId]?.summary : null), [activeChallenge, userId]);
  const opponentId = activeChallenge ? (activeChallenge.challenger.userId === userId ? activeChallenge.rival.userId : activeChallenge.challenger.userId) : "";
  const opponentSummary = useMemo(() => (activeChallenge?.submissions && opponentId ? activeChallenge.submissions[opponentId]?.summary : null), [activeChallenge, opponentId]);
  const duelQuestions = useMemo(() => toDiabloQuestions(activeChallenge?.questions || []), [activeChallenge?.questions]);

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 1180, paddingTop: 24, paddingBottom: 32 }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <h1 style={{ margin: 0 }}>PvP Arena</h1>
              <div style={{ marginTop: 6, opacity: 0.82 }}>
                <small>Async PvP is now live: create a seeded duel, answer the same questions in the shared combat modal, and compare accuracy, speed, and streak for token rewards.</small>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a className="secondaryBtn" href="/leaderboard">Leaderboard</a>
              <a className="secondaryBtn" href="/dashboard">Dashboard</a>
            </div>
          </div>
        </div>

        {!userId ? (
          <div className="card" style={{ padding: 18, marginTop: 16 }}>
            <b>Choose an active user from the dashboard first.</b>
          </div>
        ) : null}

        {error ? (
          <div className="card" style={{ padding: 14, marginTop: 16, borderColor: "rgba(255,110,110,0.45)" }}>
            {error}
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "1.05fr .95fr", gap: 16, marginTop: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ marginTop: 0 }}>Choose a rival</h3>
            <div style={{ display: "grid", gap: 10 }}>
              {leaders.map((row, idx) => (
                <button
                  key={row.userId}
                  className="featureCard"
                  type="button"
                  onClick={() => setSelectedRival(row)}
                  style={{
                    padding: 12,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    textAlign: "left",
                    borderColor: selectedRival?.userId === row.userId ? "rgba(255,214,102,0.55)" : undefined,
                  }}
                >
                  <div>
                    <b>{idx + 1}. {row.displayName}</b>
                    <div style={{ opacity: 0.76, marginTop: 4 }}><small>{row.rank} • Lvl {row.level}</small></div>
                  </div>
                  <div style={{ fontWeight: 800 }}>{row.xp} XP</div>
                </button>
              ))}
            </div>
            <button className="primaryBtn" type="button" style={{ marginTop: 14 }} disabled={!selectedRival || creating || !userId} onClick={createChallenge}>
              {creating ? "Creating duel..." : selectedRival ? `Challenge ${selectedRival.displayName}` : "Create async PvP challenge"}
            </button>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ marginTop: 0 }}>Challenge flow</h3>
            <div className="featureCard" style={{ padding: 14 }}>
              <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
                <li>Create a challenge.</li>
                <li>Your rival gets a dashboard notification and incoming challenge card.</li>
                <li>Accepting launches the same combat quiz modal used elsewhere in LevelUp Pro.</li>
                <li>Winner is decided by accuracy first, then time, then streak.</li>
              </ol>
            </div>
            <div style={{ marginTop: 12, opacity: 0.78 }}><small>Active user: {activeUser.displayName || userId}</small></div>
            {loading ? <div style={{ marginTop: 12, opacity: 0.78 }}><small>Refreshing duel board...</small></div> : null}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 16 }}>
          {[
            { title: "Incoming challenges", rows: incoming, incoming: true },
            { title: "Outgoing challenges", rows: outgoing, incoming: false },
            { title: "Completed duels", rows: completed.slice(0, 6), incoming: false },
          ].map((section) => (
            <div className="card" style={{ padding: 18 }} key={section.title}>
              <h3 style={{ marginTop: 0 }}>{section.title}</h3>
              <div style={{ display: "grid", gap: 10 }}>
                {section.rows.map((row) => {
                  const opponent = row.challenger.userId === userId ? row.rival.displayName : row.challenger.displayName;
                  const canAccept = section.incoming && row.status === "PENDING" && !row.youSubmitted;
                  const canPlay = !row.youSubmitted && (!section.incoming || Boolean(row.acceptedAt));
                  return (
                    <div key={row.id} className="featureCard" style={{ padding: 12, textAlign: "left" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <b>{opponent}</b>
                        <span className="badge">{row.status}</span>
                      </div>
                      <div style={{ marginTop: 6, opacity: 0.78 }}><small>{row.questionCount} questions • {new Date(row.createdAt).toLocaleString()}</small></div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                        {canAccept ? (
                          <button type="button" className="primaryBtn" onClick={() => acceptChallenge(row.id)}>Accept duel</button>
                        ) : null}
                        {canPlay ? (
                          <button type="button" className="secondaryBtn" onClick={() => openChallenge(row.id, true)}>Open duel</button>
                        ) : null}
                        <button type="button" className="secondaryBtn" onClick={() => openChallenge(row.id, false)}>View details</button>
                      </div>
                    </div>
                  );
                })}
                {!section.rows.length ? <small style={{ opacity: 0.78 }}>No duels here yet.</small> : null}
              </div>
            </div>
          ))}
        </div>

        {activeChallenge ? (
          <div className="card" style={{ padding: 18, marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0 }}>Duel vs {currentOpponentName}</h3>
                <div style={{ marginTop: 6, opacity: 0.78 }}>
                  <small>
                    {activeChallenge.questionCount} seeded questions • {activeChallenge.status}
                    {activeChallenge.acceptedAt ? ` • Accepted ${new Date(activeChallenge.acceptedAt).toLocaleString()}` : ""}
                  </small>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {activeChallenge.resultLabel ? <span className="badge">{activeChallenge.resultLabel}</span> : null}
                {!activeChallenge.youSubmitted ? (
                  <button type="button" className="primaryBtn" onClick={() => { setDuelOpen(true); answerRef.current = {}; startedAtRef.current = Date.now(); }}>
                    Open combat duel
                  </button>
                ) : null}
              </div>
            </div>

            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div className="featureCard" style={{ padding: 14 }}>
                <h4 style={{ marginTop: 0 }}>Your result</h4>
                {youSummary ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <div>Accuracy: <b>{Math.round((youSummary.accuracy || 0) * 100)}%</b></div>
                    <div>Correct: <b>{youSummary.correctCount}/{youSummary.totalQuestions}</b></div>
                    <div>Best streak: <b>{youSummary.bestStreak}</b></div>
                    <div>Time: <b>{formatMs(youSummary.totalTimeMs)}</b></div>
                    <div>Tokens: <b>{youSummary.awardedTokens || 0}</b></div>
                  </div>
                ) : (
                  <small style={{ opacity: 0.78 }}>Your duel result will appear here after you finish the combat session.</small>
                )}
              </div>
              <div className="featureCard" style={{ padding: 14 }}>
                <h4 style={{ marginTop: 0 }}>{currentOpponentName} result</h4>
                {opponentSummary ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <div>Accuracy: <b>{Math.round((opponentSummary.accuracy || 0) * 100)}%</b></div>
                    <div>Correct: <b>{opponentSummary.correctCount}/{opponentSummary.totalQuestions}</b></div>
                    <div>Best streak: <b>{opponentSummary.bestStreak}</b></div>
                    <div>Time: <b>{formatMs(opponentSummary.totalTimeMs)}</b></div>
                    <div>Tokens: <b>{opponentSummary.awardedTokens || 0}</b></div>
                  </div>
                ) : (
                  <small style={{ opacity: 0.78 }}>Waiting for the other player to finish.</small>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {duelOpen && activeChallenge && !activeChallenge.youSubmitted ? (
          <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(4, 8, 18, 0.84)", backdropFilter: "blur(3px)", overflow: "auto" }}>
            <div style={{ minHeight: "100vh", padding: 12 }}>
              <DiabloQuizRunner
                title="PvP Duel"
                subtitle={`Async duel • ${activeChallenge.questionCount} seeded questions`}
                enemyName={currentOpponentName}
                questions={duelQuestions}
                timed
                metaLeft={activeChallenge.lane === "TEST_NOW" ? "PvP Arena" : activeChallenge.lane}
                metaRight={activeChallenge.resultLabel || "Seeded duel"}
                exitLabel="Close"
                onExit={() => setDuelOpen(false)}
                encounterType="standard"
                rules={{ questionCount: activeChallenge.questionCount, disableStage8Intel: true }}
                onAdvanceQuestion={({ question, selectedAnswer }) => {
                  answerRef.current = { ...answerRef.current, [String(question.id || "")]: selectedAnswer ?? null };
                }}
                onComplete={(summary) => {
                  void submitChallenge(summary);
                }}
              />
              {submitting ? (
                <div className="card" style={{ maxWidth: 520, margin: "12px auto 0", padding: 14, textAlign: "center" }}>
                  Submitting duel result...
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
