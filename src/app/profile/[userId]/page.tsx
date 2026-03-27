
type Props = { params: Promise<{ userId: string }> | { userId: string } };

async function getProfile(userId: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'http://localhost:3000';
  const res = await fetch(`${base}/api/stage10/profile/${encodeURIComponent(userId)}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

export default async function PublicProfilePage({ params }: Props) {
  const resolved = await Promise.resolve(params as any);
  const userId = String(resolved?.userId || '');
  const data = userId ? await getProfile(userId) : null;
  const user = data?.user;
  const mastery = Array.isArray(data?.mastery) ? data.mastery : [];
  const achievements = Array.isArray(data?.achievements) ? data.achievements : [];

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 960, paddingTop: 24, paddingBottom: 32 }}>
        <a className="secondaryBtn" href="/leaderboard">← Back to leaderboard</a>
        <div className="card" style={{ marginTop: 14, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0 }}>{user?.displayName || userId}</h1>
              <div style={{ marginTop: 6, opacity: 0.82 }}><small>{user ? `${user.rank} • Lvl ${user.level} • ${user.xp} XP total` : 'Profile unavailable'}</small></div>
            </div>
            <img src="/levelup-pro-icon.png" alt="LevelUp Pro" style={{ width: 64, height: 64, borderRadius: 18, objectFit: 'cover' }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr .9fr', gap: 16, marginTop: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ marginTop: 0 }}>Mastery stats</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              {mastery.map((row: any) => (
                <div key={row.domain} className="featureCard" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div><b>{row.domain}</b></div>
                  <div>{Number(row.xp || 0)} XP</div>
                </div>
              ))}
              {!mastery.length ? <div style={{ opacity: 0.78 }}><small>No mastery stats yet.</small></div> : null}
            </div>
          </div>
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ marginTop: 0 }}>Achievements</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              {achievements.map((a: any) => (
                <div key={`${a.code}_${a.issuedAt}`} className="featureCard" style={{ padding: 12 }}>
                  <div style={{ fontWeight: 800 }}>{a.label || a.code}</div>
                  <div style={{ opacity: 0.75, marginTop: 4 }}><small>{a.issuedAt ? new Date(a.issuedAt).toLocaleDateString() : ''}</small></div>
                </div>
              ))}
              {!achievements.length ? <div style={{ opacity: 0.78 }}><small>No achievements yet.</small></div> : null}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
