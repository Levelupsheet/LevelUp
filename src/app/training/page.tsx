export default function TrainingCatalog() {
  const tracks = [
    { title: "Help Desk", tag: "FOUNDATION", body: "Ticket triage, troubleshooting, escalation, customer communication, identity, endpoints, and Microsoft 365 fundamentals." },
    { title: "Desktop Support", tag: "INTERMEDIATE", body: "Windows endpoint triage, device remediation, software support, access issues, and practical desktop operations." },
    { title: "Cloud Fundamentals", tag: "ADVANCING", body: "Cloud terminology, identity, security, Azure and Microsoft 365 concepts that prepare you for cloud-focused roles." },
  ];
  return (
    <main className="learningCatalog page">
      <div className="container learningCatalogInner">
        <section className="card learningHero">
          <div>
            <div className="dashboardEyebrow">POSITION TRAINING</div>
            <h1>Build job-ready IT skills.</h1>
            <p>Train through real-world scenarios, earn XP, build domain mastery, and advance along your career path.</p>
          </div>
          <a href="/dashboard" className="learningPrimaryLink">Continue from Dashboard →</a>
        </section>
        <section className="learningTrackGrid">
          {tracks.map((track) => (
            <article className="card learningTrackCard" key={track.title}>
              <span className="badge">{track.tag}</span>
              <h2>{track.title}</h2>
              <p>{track.body}</p>
            </article>
          ))}
        </section>
        <section className="card learningFlowCard">
          <div><b>1. Choose your path</b><span>Your dashboard keeps training aligned to your current role.</span></div>
          <div><b>2. Practice scenarios</b><span>Answer varied question types and use assistance when needed.</span></div>
          <div><b>3. Build mastery</b><span>XP, streaks and domain mastery update as you progress.</span></div>
          <div><b>4. Advance</b><span>Unlock interviews, battles and the next career milestones.</span></div>
        </section>
      </div>
    </main>
  );
}
