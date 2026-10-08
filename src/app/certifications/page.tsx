import { getActiveContentPools } from "@/lib/activePools";
export const dynamic = "force-dynamic";
export default async function CertificationsCatalog() {
  let tracks: Array<{ title: string; tag: string; body: string }> = [];
  let loadError = false;
  try {
    tracks = (await getActiveContentPools()).filter(pool => pool.lane === "CERTIFICATIONS" && pool.questionCount > 0)
      .map(pool => ({ title: pool.label, tag: `${pool.questionCount} questions`, body: "Practice published certification questions with explanations and domain feedback." }));
  } catch { loadError = true; }
  return (
    <main className="learningCatalog page paidAssetPage certificationsAssetPage">
      <div className="container learningCatalogInner">
        <section className="card learningHero paidAssetHero">
          <div>
            <div className="dashboardEyebrow">CERTIFICATION PRACTICE</div>
            <h1>Turn knowledge into exam readiness.</h1>
            <p>Practice certification domains inside the same LevelUp progression system and use results to identify what to study next.</p>
          </div>
          <a href="/dashboard" className="learningPrimaryLink gdActionOrange">Start from Dashboard →</a>
        </section>
        <section className="learningTrackGrid">
          {loadError ? <p>Certification pools could not be loaded. Please try again.</p> : !tracks.length ? <p>No certification pools are currently published.</p> : null}
          {tracks.map((track) => (
            <article className="card learningTrackCard paidAssetPanel" key={track.title}>
              <span className="badge">{track.tag}</span>
              <h2>{track.title}</h2>
              <p>{track.body}</p>
            </article>
          ))}
        </section>
        <section className="card learningFlowCard paidAssetPanel">
          <div><b>Practice</b><span>Work through certification-focused questions and scenarios.</span></div>
          <div><b>Measure</b><span>Track mastery and performance as you answer.</span></div>
          <div><b>Review</b><span>Use explanations and domain feedback to close gaps.</span></div>
          <div><b>Repeat</b><span>Return to weaker areas until your performance is consistent.</span></div>
        </section>
        <p className="learningLegal">Certification names are trademarks of their respective owners. LevelUp Pro provides independent practice content.</p>
      </div>
    </main>
  );
}
