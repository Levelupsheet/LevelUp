export default function CertificationsCatalog() {
  const tracks = [
    { title: "CompTIA A+", tag: "CORE IT", body: "Hardware, operating systems, networking, troubleshooting, security, and support fundamentals." },
    { title: "Security+", tag: "SECURITY", body: "Threats, architecture, operations, identity, governance, risk, and practical security concepts." },
    { title: "AZ-900", tag: "CLOUD", body: "Azure fundamentals, cloud concepts, core services, security, governance, pricing, and support." },
  ];
  return (
    <main className="learningCatalog page">
      <div className="container learningCatalogInner">
        <section className="card learningHero">
          <div>
            <div className="dashboardEyebrow">CERTIFICATION PRACTICE</div>
            <h1>Turn knowledge into exam readiness.</h1>
            <p>Practice certification domains inside the same LevelUp progression system and use results to identify what to study next.</p>
          </div>
          <a href="/dashboard" className="learningPrimaryLink">Start from Dashboard →</a>
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
