
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

async function getCoachData() {
  const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "http://localhost:3000";
  const userId = process.env.STAGE12_PREVIEW_USER_ID || "demo-user";
  try {
    const res = await fetch(`${base}/api/stage12/status?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function CoachPage() {
  const data = await getCoachData() as CoachData | null;
  const profile = data?.profile || null;
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
            <div style={{ fontWeight: 900, fontSize: 24 }}>{profile?.targetRole || "No analysis yet"}</div>
            <div style={{ marginTop: 8, opacity: 0.86 }}>
              <small>{profile?.coaching?.summary || "Upload and analyze a resume from the dashboard to unlock the AI coach."}</small>
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(profile?.inferredDomains || []).map((row) => (
                <span key={row.domain} className="badge">{row.domain} · {row.score}</span>
              ))}
            </div>
            {data?.analyzedAt ? <div style={{ marginTop: 10, opacity: 0.72 }}><small>Last analyzed {new Date(data.analyzedAt).toLocaleString()}</small></div> : null}
          </div>

          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ marginTop: 0 }}>Focus areas</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {(profile?.coaching?.focusAreas || profile?.gaps || []).slice(0, 5).map((row, idx) => (
                <div key={`focus_${idx}`} className="featureCard" style={{ padding: 12 }}>{row}</div>
              ))}
              {!((profile?.coaching?.focusAreas || profile?.gaps || []).length) ? <small style={{ opacity: 0.78 }}>No focus areas yet.</small> : null}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ marginTop: 0 }}>Detected skills</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(profile?.skills || []).slice(0, 20).map((skill) => <span key={skill} className="badge">{skill}</span>)}
              {!profile?.skills?.length ? <small style={{ opacity: 0.78 }}>No skills mapped yet.</small> : null}
            </div>
          </div>
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ marginTop: 0 }}>Coach next actions</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {(profile?.coaching?.nextActions || []).slice(0, 5).map((row, idx) => (
                <div key={`act_${idx}`} className="featureCard" style={{ padding: 12 }}>{row}</div>
              ))}
              {!profile?.coaching?.nextActions?.length ? <small style={{ opacity: 0.78 }}>No recommendations yet.</small> : null}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
