"use client";

import { useEffect, useState } from "react";

type CoachData = {
  ok?: boolean;
  analyzedAt?: string | null;
  profile?: {
    targetRole?: string;
    skills?: string[];
    certifications?: string[];
    inferredDomains?: { domain: string; score: number }[];
    gaps?: string[];
    coaching?: {
      summary?: string;
      strengths?: string[];
      focusAreas?: string[];
      nextActions?: string[];
      behaviorNotes?: string[];
    };
  } | null;
};

function getActiveUserId() {
  if (typeof window === "undefined") return "";
  try {
    const explicit =
      localStorage.getItem("activeUserId") ||
      localStorage.getItem("lu_active_user_id") ||
      localStorage.getItem("demo-user-id");
    if (explicit) return explicit;

    const raw =
      localStorage.getItem("lu_user") ||
      localStorage.getItem("levelup_user") ||
      localStorage.getItem("activeUser");

    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.id || parsed?.userId || parsed?.email || "";
    }
  } catch {}
  return "";
}

export default function CoachPage() {
  const [data, setData] = useState<CoachData | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");

  useEffect(() => {
    const id = getActiveUserId();
    setUserId(id);

    async function load() {
      if (!id) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(
          `/api/stage12/status?userId=${encodeURIComponent(id)}`,
          { cache: "no-store" }
        );
        const json = res.ok ? await res.json() : null;
        setData(json);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const profile = data?.profile || null;
  const focusAreas = (profile?.coaching?.focusAreas || profile?.gaps || []).slice(0, 5);
  const nextActions = (profile?.coaching?.nextActions || []).slice(0, 5);
  const detectedSkills = (profile?.skills || []).slice(0, 20);
  const inferredDomains = profile?.inferredDomains || [];
  const hasAnalysis = !!profile && !!(
    profile.targetRole ||
    detectedSkills.length ||
    focusAreas.length ||
    nextActions.length ||
    inferredDomains.length
  );

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 1080, paddingTop: 24, paddingBottom: 40 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <h1 style={{ margin: 0 }}>AI Coach</h1>
              <div style={{ marginTop: 6, opacity: 0.82 }}>
                <small>Resume analysis, skill-gap mapping, and LevelUp learning-path recommendations.</small>
              </div>
            </div>
            <a className="secondaryBtn" href="/dashboard">Back to dashboard</a>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.95fr", gap: 16, marginTop: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ marginTop: 0 }}>Career fit</h3>
            <div style={{ fontWeight: 900, fontSize: 24 }}>
              {loading ? "Loading..." : profile?.targetRole || "No analysis yet"}
            </div>
            <div style={{ marginTop: 8, opacity: 0.86 }}>
              <small>
                {loading
                  ? "Loading your AI coach profile..."
                  : profile?.coaching?.summary ||
                    "Upload and analyze a resume from the dashboard to unlock the AI coach."}
              </small>
            </div>

            <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {inferredDomains.map((row) => (
                <span key={row.domain} className="badge">
                  {row.domain} · {row.score}
                </span>
              ))}
            </div>

            {data?.analyzedAt ? (
              <div style={{ marginTop: 10, opacity: 0.72 }}>
                <small>Last analyzed {new Date(data.analyzedAt).toLocaleString()}</small>
              </div>
            ) : null}

            {!loading && !hasAnalysis ? (
              <div style={{ marginTop: 14, opacity: 0.78 }}>
                <small>
                  No analyzed profile was found for the current active user
                  {userId ? ` (${userId})` : ""}.
                </small>
              </div>
            ) : null}
          </div>

          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ marginTop: 0 }}>Focus areas</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {focusAreas.map((row, idx) => (
                <div key={`focus_${idx}`} className="featureCard" style={{ padding: 12 }}>
                  {row}
                </div>
              ))}
              {!focusAreas.length && !loading ? (
                <small style={{ opacity: 0.78 }}>No focus areas yet.</small>
              ) : null}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ marginTop: 0 }}>Detected skills</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {detectedSkills.map((skill) => (
                <span key={skill} className="badge">{skill}</span>
              ))}
              {!detectedSkills.length && !loading ? (
                <small style={{ opacity: 0.78 }}>No skills mapped yet.</small>
              ) : null}
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ marginTop: 0 }}>Coach next actions</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {nextActions.map((row, idx) => (
                <div key={`act_${idx}`} className="featureCard" style={{ padding: 12 }}>
                  {row}
                </div>
              ))}
              {!nextActions.length && !loading ? (
                <small style={{ opacity: 0.78 }}>No recommendations yet.</small>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}