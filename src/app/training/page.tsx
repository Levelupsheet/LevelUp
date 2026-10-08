import { getActiveContentPools } from "@/lib/activePools";
export const dynamic = "force-dynamic";
export default async function TrainingCatalog() {
  let tracks: Array<{title:string;tag:string;body:string}> = [];
  let loadError = false;
  try { tracks = (await getActiveContentPools()).filter(p => p.lane === 'TRAINING').map(p => ({title:p.careerPath || p.label,tag:p.industry || 'Career training',body:`${p.questionCount} published questions across ${p.poolCount} pools.`})); } catch { loadError = true; }
  return (
    <main className="learningCatalog page paidAssetPage trainingAssetPage">
      <div className="container learningCatalogInner">
        <section className="card learningHero paidAssetHero">
          <div>
            <div className="dashboardEyebrow">POSITION TRAINING</div>
            <h1>Build skills for your career.</h1>
            <p>Train through real-world scenarios, earn XP, build domain mastery, and advance along your career path.</p>
          </div>
          <a href="/dashboard" className="learningPrimaryLink gdActionOrange">Continue from Dashboard →</a>
        </section>
        <section className="learningTrackGrid">
          {loadError ? <p role="alert">Could not load published career pools. Please retry.</p> : !tracks.length ? <p>No published career pools yet.</p> : null}
          {tracks.map((track) => (
            <article className="card learningTrackCard paidAssetPanel" key={track.title}>
              <span className="badge">{track.tag}</span>
              <h2>{track.title}</h2>
              <p>{track.body}</p>
            </article>
          ))}
        </section>
        <section className="card learningFlowCard paidAssetPanel">
          <div><b>1. Choose your path</b><span>Your dashboard keeps training aligned to your current role.</span></div>
          <div><b>2. Practice scenarios</b><span>Answer varied question types and use assistance when needed.</span></div>
          <div><b>3. Build mastery</b><span>XP, streaks and domain mastery update as you progress.</span></div>
          <div><b>4. Advance</b><span>Unlock interviews, battles and the next career milestones.</span></div>
        </section>
      </div>
    </main>
  );
}
