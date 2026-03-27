"use client";

import { useEffect, useMemo, useState } from "react";

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

export default function PvpPage() {
  const [activeUser, setActiveUser] = useState<{ id: string; displayName: string }>({ id: "", displayName: "" });
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [selectedRival, setSelectedRival] = useState<LeaderRow | null>(null);
  const [incoming, setIncoming] = useState<PvpChallengeView[]>([]);
  const [outgoing, setOutgoing] = useState<PvpChallengeView[]>([]);
  const [completed, setCompleted] = useState<PvpChallengeView[]>([]);
  const [activeChallenge, setActiveChallenge] = useState<PvpChallengeView | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [startedAt, setStartedAt] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  const currentQuestion = activeChallenge?.questions?.[currentIndex] || null;
  const userId = activeUser.id;

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
        setIncoming(Array.isArray(json?.incoming) ? json.incoming : []);
        setOutgoing(Array.isArray(json?.outgoing) ? json.outgoing : []);
        setCompleted(Array.isArray(json?.completed) ? json.completed : []);
        const all = [
          ...(Array.isArray(json?.incoming) ? json.incoming : []),
          ...(Array.isArray(json?.outgoing) ? json.outgoing : []),
          ...(Array.isArray(json?.completed) ? json.completed : []),
        ];
        const picked = targetChallengeId ? all.find((row: any) => row.id === targetChallengeId) : activeChallenge ? all.find((row: any) => row.id === activeChallenge.id) : null;
        if (picked) {
          setActiveChallenge(picked);
          if (!picked.youSubmitted) {
            setCurrentIndex(0);
            setStartedAt(Date.now());
          }
        }
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

  useEffect(() => {
    if (activeChallenge && !activeChallenge.youSubmitted) {
      setAnswers({});
      setCurrentIndex(0);
      setStartedAt(Date.now());
    }
  }, [activeChallenge?.id]);

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
      if (challenge) setActiveChallenge(challenge);
      await loadBoardAndChallenges(challenge?.id);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setCreating(false);
    }
  }

  async function openChallenge(id: string) {
    if (!userId) return;
    setError("");
    try {
      const res = await fetch(`/api/pvp/challenges/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || json?.error || "Failed to load challenge");
      setActiveChallenge(json?.challenge || null);
    } catch (err: any) {
      setError(String(err?.message || err));
    }
  }

  function setAnswer(questionId: string, value: any) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  async function submitChallenge() {
    if (!activeChallenge || !userId) return;
    setSubmitting(true);
    setError("");
    try {
      const payloadAnswers = activeChallenge.questions.map((q) => answers[q.id] ?? null);
      const totalTimeMs = startedAt ? Date.now() - startedAt : 0;
      const res = await fetch(`/api/pvp/challenges/${encodeURIComponent(activeChallenge.id)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, answers: payloadAnswers, totalTimeMs }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || json?.error || "Failed to submit challenge");
      setActiveChallenge(json?.challenge || null);
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
  const answeredCount = activeChallenge ? activeChallenge.questions.filter((q) => answers[q.id] !== undefined && answers[q.id] !== null && answers[q.id] !== "").length : 0;

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 1180, paddingTop: 24, paddingBottom: 32 }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <h1 style={{ margin: 0 }}>PvP Arena</h1>
              <div style={{ marginTop: 6, opacity: 0.82 }}>
                <small>Async PvP is now live: create a seeded duel, answer the same questions, and compare accuracy, speed, and streak for token rewards.</small>
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
                <li>Both players get the same seeded six-question duel.</li>
                <li>Winner is decided by accuracy first, then time, then streak.</li>
                <li>Winner gets 25 tokens, runner-up gets 10.</li>
              </ol>
            </div>
            <div style={{ marginTop: 12, opacity: 0.78 }}><small>Active user: {activeUser.displayName || userId}</small></div>
            {loading ? <div style={{ marginTop: 12, opacity: 0.78 }}><small>Refreshing duel board...</small></div> : null}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 16 }}>
          {[
            { title: "Incoming challenges", rows: incoming },
            { title: "Outgoing challenges", rows: outgoing },
            { title: "Completed duels", rows: completed.slice(0, 6) },
          ].map((section) => (
            <div className="card" style={{ padding: 18 }} key={section.title}>
              <h3 style={{ marginTop: 0 }}>{section.title}</h3>
              <div style={{ display: "grid", gap: 10 }}>
                {section.rows.map((row) => {
                  const opponent = row.challenger.userId === userId ? row.rival.displayName : row.challenger.displayName;
                  return (
                    <button key={row.id} type="button" className="featureCard" onClick={() => openChallenge(row.id)} style={{ padding: 12, textAlign: "left" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <b>{opponent}</b>
                        <span className="badge">{row.status}</span>
                      </div>
                      <div style={{ marginTop: 6, opacity: 0.78 }}><small>{row.questionCount} questions • {new Date(row.createdAt).toLocaleString()}</small></div>
                    </button>
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
                <h3 style={{ margin: 0 }}>Duel vs {activeChallenge.challenger.userId === userId ? activeChallenge.rival.displayName : activeChallenge.challenger.displayName}</h3>
                <div style={{ marginTop: 6, opacity: 0.78 }}><small>{activeChallenge.questionCount} seeded questions • {activeChallenge.status}</small></div>
              </div>
              {activeChallenge.resultLabel ? <span className="badge">{activeChallenge.resultLabel}</span> : null}
            </div>

            {activeChallenge.youSubmitted ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
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
                  ) : null}
                </div>
                <div className="featureCard" style={{ padding: 14 }}>
                  <h4 style={{ marginTop: 0 }}>Opponent result</h4>
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
            ) : currentQuestion ? (
              <>
                <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <span className="badge">Question {currentIndex + 1} / {activeChallenge.questionCount}</span>
                  <span className="badge">Answered {answeredCount} / {activeChallenge.questionCount}</span>
                </div>

                <div className="featureCard" style={{ padding: 16, marginTop: 14 }}>
                  <div style={{ fontWeight: 900, fontSize: 22 }}>{currentQuestion.prompt}</div>
                  <div style={{ marginTop: 8, opacity: 0.72 }}><small>{currentQuestion.type.replaceAll("_", " ")}</small></div>

                  {(currentQuestion.type === "multiple_choice" || currentQuestion.type === "incident" || currentQuestion.type === "true_false") ? (
                    <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                      {(currentQuestion.choices || []).map((choice, idx) => (
                        <button key={`${currentQuestion.id}_${idx}`} type="button" className="featureCard" onClick={() => setAnswer(currentQuestion.id, idx)} style={{ padding: 12, textAlign: "left", borderColor: answers[currentQuestion.id] === idx ? "rgba(108,175,255,0.65)" : undefined }}>
                          {choice}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {currentQuestion.type === "fill_blank" || currentQuestion.type === "cli_command" ? (
                    <div style={{ marginTop: 14 }}>
                      <input
                        value={answers[currentQuestion.id] || ""}
                        onChange={(e) => setAnswer(currentQuestion.id, e.target.value)}
                        placeholder={currentQuestion.data?.placeholder || "Type your answer"}
                        className="input"
                        style={{ width: "100%", padding: 12, borderRadius: 12 }}
                      />
                    </div>
                  ) : null}

                  {currentQuestion.type === "multi_select" ? (
                    <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                      {(currentQuestion.choices || []).map((choice, idx) => {
                        const selected: number[] = Array.isArray(answers[currentQuestion.id]) ? answers[currentQuestion.id] : [];
                        const checked = selected.includes(idx);
                        return (
                          <label key={`${currentQuestion.id}_${idx}`} className="featureCard" style={{ padding: 12, display: "flex", gap: 10, alignItems: "center" }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const current = Array.isArray(answers[currentQuestion.id]) ? [...answers[currentQuestion.id]] : [];
                                const next = e.target.checked ? [...current, idx] : current.filter((n: number) => n !== idx);
                                setAnswer(currentQuestion.id, next.sort((a: number, b: number) => a - b));
                              }}
                            />
                            <span>{choice}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
                  <button type="button" className="secondaryBtn" onClick={() => setCurrentIndex((v) => Math.max(0, v - 1))} disabled={currentIndex <= 0}>Previous</button>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {currentIndex < activeChallenge.questionCount - 1 ? (
                      <button type="button" className="secondaryBtn" onClick={() => setCurrentIndex((v) => Math.min(activeChallenge.questionCount - 1, v + 1))}>Next question</button>
                    ) : null}
                    <button type="button" className="primaryBtn" onClick={submitChallenge} disabled={submitting || answeredCount < activeChallenge.questionCount}>
                      {submitting ? "Submitting duel..." : "Submit duel"}
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
