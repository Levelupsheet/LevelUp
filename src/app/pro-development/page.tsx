export default function ProDevelopmentPage() {
  return (
    <main className="page careerPathPage">
      <div className="container careerPathInner">
        <section className="card careerPathHero">
          <div className="dashboardEyebrow">LONG-TERM CAREER PATH</div>
          <h1>Professional Development</h1>
          <p>Connect formal education, certifications, and LevelUp practice to the role you want next.</p>
          <div className="careerPathActions">
            <a className="btn gold" href="/training">Continue training</a>
            <a className="secondaryBtn" href="/coach">Open AI Coach</a>
            <a className="secondaryBtn" href="/dashboard">Dashboard</a>
          </div>
        </section>
        <section className="careerPathGrid">
          <div className="card careerPathCard"><span>01</span><h2>Choose a direction</h2><p>Map IT, computer science, cybersecurity, or cloud education to your target career.</p></div>
          <div className="card careerPathCard"><span>02</span><h2>Build the foundation</h2><p>Combine coursework with practical LevelUp scenarios and certification preparation.</p></div>
          <div className="card careerPathCard"><span>03</span><h2>Prove readiness</h2><p>Use mastery, interview practice, and progression data to identify what needs work next.</p></div>
        </section>
        <section className="card careerPathNext">
          <div><div className="dashboardEyebrow">RECOMMENDED FLOW</div><h2>Turn learning into career momentum</h2></div>
          <p>Training builds skill. Certifications validate knowledge. Interview battles build communication. AI Coach brings those signals together into your next actions.</p>
        </section>
      </div>
    </main>
  );
}
