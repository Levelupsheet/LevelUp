
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MerchModal from "@/components/MerchModal";


function trackEnterApp(source: string) {
  try {
    const payload = JSON.stringify({ source, path: "/start", meta: { ts: Date.now() } });
    // Prefer sendBeacon so the redirect isn't blocked
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav: any = navigator as any;
    if (nav?.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      nav.sendBeacon("/api/track/enter-app", blob);
      return;
    }
    fetch("/api/track/enter-app", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

function goEnterApp(source: string) {
  trackEnterApp(source);
  window.location.href = "/dashboard";
}

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function Home() {
  const raf = useRef<number | null>(null);
  const [merchOpen, setMerchOpen] = useState(false);
  const [planModal, setPlanModal] = useState<null | { plan: string; price: string }>(null);

  const [leaderboard, setLeaderboard] = useState<Array<{ id: string; displayName: string; xp: number; level: number; rank: string }> | null>(null);
  const [leaderboardMetric, setLeaderboardMetric] = useState<"top" | "active" | "improved">("top");
  const [lbSelected, setLbSelected] = useState<{ id: string; displayName: string; xp: number; level: number; rank: string } | null>(null);
  const [aboutOpen, setAboutOpen] = useState<null | "company" | "product" | "contact">(null);

  useEffect(() => {
    const onScroll = () => {
      if (raf.current) return;
      raf.current = window.requestAnimationFrame(() => {
        const y = window.scrollY || 0;

        // Subtle depth: hero background moves slower than page
        const heroShift = Math.min(0, -y * 0.12);
        const cardShift = Math.min(0, -y * 0.06);

        document.documentElement.style.setProperty("--heroShift", `${heroShift}px`);
        document.documentElement.style.setProperty("--cardShift", `${cardShift}px`);
        raf.current = null;
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  // Soft reveal: fade/slide sections into view as you scroll.
  useEffect(() => {
    const scope = document.querySelector("main.landing") ?? document;
    const nodes = Array.from(scope.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!nodes.length) return;

    nodes.forEach((el) => {
      const d = el.getAttribute("data-delay");
      if (d) el.style.setProperty("--revealDelay", `${Number(d)}ms`);
      el.classList.add("reveal");
    });

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add("isVisible");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.14, rootMargin: "0px 0px -10% 0px" }
    );

    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  // Mini leaderboard (top 3)
  useEffect(() => {
    let alive = true;

    // Keep the server in sync with local/demo XP so the leaderboard reflects
    // what the user sees in the app header.
    try {
      const raw = localStorage.getItem("lu_active_user_v1");
      const u = raw ? JSON.parse(raw) : null;
      const localXp = Number(u?.xp ?? 0);
      const uid = String(u?.id ?? "");
      if (uid && Number.isFinite(localXp) && localXp > 0) {
        fetch("/api/users/sync-xp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: uid, xp: localXp }),
        }).catch(() => {});
      }
    } catch {}

    fetch(`/api/leaderboard/top?metric=${leaderboardMetric}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("leaderboard"))))
      .then((data) => {
        if (!alive) return;
        setLeaderboard(Array.isArray(data?.top) ? data.top : []);
        setLbSelected((cur) => {
          if (!cur) return null;
          const still = Array.isArray(data?.top) ? data.top.find((u: any) => u?.id === cur.id) : null;
          return still ?? null;
        });
      })
      .catch(() => {
        if (!alive) return;
        setLeaderboard([]);
      });
    return () => {
      alive = false;
    };
  }, [leaderboardMetric]);

  return (
    <main className="landing">
      <header className="navTop">
        <div className="navTopInner">
        <div className="brandLock">
          <div className="brandMark">L</div>
          <div className="brandText">
            <b>LevelUp Pro</b>
            <small>Gamified IT training</small>
          </div>
        </div>

        <nav className="navLinks">
          <a href="#how" onClick={(e) => (e.preventDefault(), scrollToId("how"))}>How it works</a>
          <a href="#features" onClick={(e) => (e.preventDefault(), scrollToId("features"))}>Features</a>
          <a href="#pricing" onClick={(e) => (e.preventDefault(), scrollToId("pricing"))}>Pricing</a>
          <a href="#about" onClick={(e) => (e.preventDefault(), scrollToId("about"))}>About Us</a>
          <a href="/rewards">Rewards</a>
          <a href="#merch" onClick={(e) => (e.preventDefault(), setMerchOpen(true))}>Merch</a>
        </nav>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="secondaryBtn" onClick={() => scrollToId("pricing")}>View pricing</button>
          <button className="gold" onClick={() => goEnterApp("nav")}>Enter app →</button>
        </div>
        </div>
      </header>

      {planModal && (
        <div className="luModalOverlay" onClick={() => setPlanModal(null)}>
          <div className="luModal" role="dialog" aria-modal="true" aria-label="Pricing details" onClick={(e) => e.stopPropagation()}>
            <div className="luModalHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <b style={{ fontSize: 18 }}>{planModal.plan} — {planModal.price}</b>
                <div><small className="luHint">Billing is coming next. We’ll wire Stripe when you’re ready.</small></div>
              </div>
              <button className="secondaryBtn" type="button" onClick={() => setPlanModal(null)}>✕</button>
            </div>

            <div className="luModalBody">
              <div className="featureCard" style={{ padding: 12 }}>
                <b>What happens next</b>
                <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                  This button will become a secure checkout. For now, it’s a placeholder so we can finish the product flow first.
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
                <button className="secondaryBtn" type="button" onClick={() => setPlanModal(null)}>Close</button>
                <button className="gold" type="button" onClick={() => setPlanModal(null)}>Sounds good</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="hero">
        <div className="heroBg" />
        <div className="heroStreaks" aria-hidden="true">
          <span className="streak s1" />
          <span className="streak s2" />
        </div>
        <div className="heroShade" />

        <div className="heroContent">
          <div data-reveal data-delay="0">
            <div className="heroGlowWrap">
              <h1 className="heroH1">Level up your IT career — EARN while you LEARN!</h1>
            </div>
            <p className="heroP">
              Earn real experience (XP) through real-world scenario challenges, unlock interview simulations, and master
              certificate training. Enter our monthly Sweepstakes <b>FREE</b> — win <b>real prizes</b>. Built by
              Professionals for Professionals, and enhanced by AI.
            </p>

            <div className="ctaRow">
              <button className="gold" onClick={() => goEnterApp("hero_primary")}>Start free →</button>
              <button className="secondaryBtn" onClick={() => scrollToId("how")}>See how it works</button>
            </div>

            <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
              Pro: <b>$5.99/mo</b> • Premium: <b>$19.99/mo</b> • Cancel anytime
            </p>
          </div>

          {/* Right column stack keeps leaderboard aligned with the KPI box */}
          <div className="heroRight" data-reveal data-delay="140">
            <div className="heroCard revealFast">
              <div className="kpiMini">
                <div><b>XP</b> <span className="muted">• 350 / 500</span></div>
                <div className="muted">Helpdesk L1</div>
              </div>
              <div className="xpBar"><div className="xpFill" /></div>

              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                <div className="featureCard" style={{ padding: 12 }}>
                  <b>Interview Ready</b>
                  <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                    Pass the HR screen → unlock the tech panel.
                  </div>
                </div>

                <div className="featureCard" style={{ padding: 12 }}>
                  <b>Certification practice</b>
                  <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                    A+ • Security+ • AZ-900 — timed mode later.
                  </div>
                </div>

                <div className="featureCard" style={{ padding: 12 }}>
                  <b>Career outlook</b>
                  <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                    Roles, salary ranges, and what to learn next.
                  </div>
                </div>
              </div>
            </div>

            {/* Leaderboard (no full-screen modal blur; inline widget) */}
            <div className="heroCard" data-reveal data-delay="220">
              <div className="kpiMini" style={{ alignItems: "center" }}>
                <div>
                  <b>Leaderboard</b> <span className="muted">• {leaderboardMetric === "top" ? "Top candidates" : leaderboardMetric === "active" ? "Most active" : "Most improved"}</span>
                </div>
                <div className="pillTabs" aria-label="Leaderboard tabs">
                  <button className={leaderboardMetric === "top" ? "pillTab active" : "pillTab"} onClick={() => setLeaderboardMetric("top")} type="button">Top</button>
                  <button className={leaderboardMetric === "active" ? "pillTab active" : "pillTab"} onClick={() => setLeaderboardMetric("active")} type="button">Active</button>
                  <button className={leaderboardMetric === "improved" ? "pillTab active" : "pillTab"} onClick={() => setLeaderboardMetric("improved")} type="button">Improved</button>
                </div>
              </div>

              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {(leaderboard ?? [null, null, null]).slice(0, 3).map((u: any, idx: number) => {
                  const isSelected = !!u && lbSelected?.id === u.id;
                  return (
                    <button
                      key={u?.id ?? idx}
                      type="button"
                      className={isSelected ? "featureCard lbRow selected" : "featureCard lbRow"}
                      onClick={() => u && setLbSelected(isSelected ? null : u)}
                      style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, textAlign: "left" }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span aria-hidden="true" className="badge" style={{ width: 28, textAlign: "center" }}>{idx + 1}</span>
                          <b style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u?.displayName ?? "—"}</b>
                        </div>
                        <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>{u ? `Lvl ${u.level} • ${u.rank}` : "Loading..."}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{u ? `${u.xp} XP` : ""}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{u ? "Tap to view" : ""}</div>
                      </div>
                    </button>
                  );
                })}
                {leaderboard && leaderboard.length === 0 && (
                  <div className="muted" style={{ fontSize: 13, opacity: 0.8 }}>No users yet. Be the first to rank up.</div>
                )}
              </div>

              {lbSelected && (
                <div className="lbWidget" style={{ marginTop: 12 }} aria-label="Leaderboard profile widget">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lbSelected.displayName}</div>
                      <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>Lvl {lbSelected.level} • {lbSelected.rank}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 900 }}>{lbSelected.xp} XP</div>
                      <div className="muted" style={{ fontSize: 12 }}>Top 3</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button className="secondaryBtn" type="button" onClick={() => goEnterApp("leaderboard_view")}>View in app</button>
                    <button className="secondaryBtn" type="button" onClick={() => setLbSelected(null)}>Close</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="section" data-reveal data-delay="0">
        <h2 className="sectionTitle">How it works</h2>
        <p className="sectionSub">
          A modern training loop: pick a path, earn XP through practice, then unlock realistic interview milestones.
        </p>

        <div className="grid3">
          <div className="featureCard" data-reveal data-delay="0">
            <b>1) Choose your path</b>
            <p className="muted" style={{ margin: "8px 0 0 0" }}>
              Helpdesk Support → Desktop Technician → Cloud Engineer. Your plan adapts as you improve.
            </p>
          </div>
          <div className="featureCard" data-reveal data-delay="90">
            <b>2) Earn XP by practicing</b>
            <p className="muted" style={{ margin: "8px 0 0 0" }}>
              Answer questions, learn concepts, and build confidence with structured feedback.
            </p>
          </div>
          <div className="featureCard" data-reveal data-delay="180">
            <b>3) Unlock interviews + offers</b>
            <p className="muted" style={{ margin: "8px 0 0 0" }}>
              Pass HR → pass Tech → receive a mock offer letter + a professional badge.
            </p>
          </div>
        </div>
      </section>

      <section id="features" className="section" data-reveal data-delay="0">
        <h2 className="sectionTitle">What you get</h2>
        <p className="sectionSub">
          Built to feel like a 2026 product: clean, fast, and motivating — with subtle gamification that keeps you moving.
        </p>

        <div className="grid3">
          <div className="featureCard" data-reveal data-delay="0"><b>Interview simulations</b><p className="muted" style={{ marginTop: 8 }}>HR screen → Tech panel flow with unlocks.</p></div>
          <div className="featureCard" data-reveal data-delay="90"><b>Certification prep</b><p className="muted" style={{ marginTop: 8 }}>Practice tests for A+, Security+, and AZ-900.</p></div>
          <div className="featureCard" data-reveal data-delay="180"><b>Career outlook</b><p className="muted" style={{ marginTop: 8 }}>See next roles, salary ranges, and recommended certs.</p></div>
          <div className="featureCard" data-reveal data-delay="270"><b>XP + levels</b><p className="muted" style={{ marginTop: 8 }}>Progress you can feel: XP bars, ranks, and badges.</p></div>
          <div className="featureCard" data-reveal data-delay="360"><b>Personalized path</b><p className="muted" style={{ marginTop: 8 }}>Start where you are, and grow into Desktop and Cloud.</p></div>
          <div className="featureCard" data-reveal data-delay="450"><b>Offer PDFs</b><p className="muted" style={{ marginTop: 8 }}>Generate downloadable mock offer letters (Premium).</p></div>
        </div>
      </section>

      <section id="pricing" className="section" data-reveal data-delay="0">
        <h2 className="sectionTitle">Pricing</h2>
        <p className="sectionSub">Start free, upgrade when you’re ready. Cancel anytime.</p>

        <div className="priceGrid">
          <div className="priceCard" data-reveal data-delay="0">
            <b>Free</b>
            <div className="priceTag">$0</div>
            <div className="muted">For getting started</div>
            <ul style={{ marginTop: 12 }}>
              <li>Basic IT Support question bank</li>
              <li>XP tracking</li>
              <li>Career path preview</li>
              <li>Limited interview practice</li>
            </ul>
            <button className="primary" style={{ width: "100%" }} onClick={() => goEnterApp("nav")}>Start free</button>
          </div>

          <div className="priceCard priceCardPro" data-reveal data-delay="120">
            <b>Pro</b>
            <div className="priceTag">$5.99<span className="muted" style={{ fontSize: 14 }}>/mo</span></div>
            <div className="muted">Best value</div>
            <ul style={{ marginTop: 12 }}>
              <li>Unlimited daily practice</li>
              <li>Certification modules (A+, Sec+, AZ-900)</li>
              <li>Career outlook + salary insights</li>
              <li>More interview unlocks</li>
            </ul>
            <button className="gold" style={{ width: "100%" }} onClick={() => setPlanModal({ plan: "Pro", price: "$5.99/mo" })}>Go Pro</button>
          </div>

          <div className="priceCard" data-reveal data-delay="240">
            <b>Premium</b>
            <div className="priceTag">$19.99<span className="muted" style={{ fontSize: 14 }}>/mo</span></div>
            <div className="muted">For serious accelerators</div>
            <ul style={{ marginTop: 12 }}>
              <li>AI mock tech interview panel (coming)</li>
              <li>Advanced analytics</li>
              <li>Mock offer letters + badges</li>
              <li>Early access features</li>
            </ul>
            <button className="primary" style={{ width: "100%" }} onClick={() => setPlanModal({ plan: "Pro", price: "$5.99/mo" })}>Go Premium</button>
          </div>
        </div>

        <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>
          Note: payment integration is planned (Stripe). For now, the buttons are placeholders.
        </p>
      </section>

      {/* Cinematic lower-half background section (premium) */}
      <section className="cinematicSection" aria-label="Sweepstakes" data-reveal data-delay="0">
        <div className="cinematicBg" aria-hidden="true" />
        <div className="cinematicInner">
          <div className="cinematicHeader" data-reveal data-delay="60">
            <div>
              <h2 className="sectionTitle" style={{ marginBottom: 8 }}>Sweep Stakes</h2>
              <p className="sectionSub" style={{ marginBottom: 0 }}>
                Win real prizes while you level up. Earn entries through progress, challenges, and leaderboards.
              </p>
            </div>
            <div className="trustRow" aria-label="Signals">
              <span className="trustPill">✅ Server-verified entries</span>
              <span className="trustPill">🎁 Monthly prizes</span>
              <span className="trustPill">🏆 Leaderboard boosts</span>
            </div>
          </div>

          <div className="grid3" style={{ marginTop: 16 }}>
            <div className="featureCard" data-reveal data-delay="120">
              <b>How to enter</b>
              <p className="muted" style={{ marginTop: 8 }}>
                Earn entries by leveling up, completing challenges, and staying active. No auto-popups — your entries stack.
              </p>
            </div>
            <div className="featureCard" data-reveal data-delay="210">
              <b>Monthly sweepstakes</b>
              <p className="muted" style={{ marginTop: 8 }}>
                Each month features real prizes. Higher ranks and diamond loot can unlock bonus entries.
              </p>
            </div>
            <div className="featureCard" data-reveal data-delay="300">
              <b>Win REAL prizes</b>
              <p className="muted" style={{ marginTop: 8 }}>
                Gift cards, gear, and premium rewards. Winners are announced transparently with server-verified logs.
              </p>
            </div>
          </div>

          <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }} data-reveal data-delay="360">
            <button className="gold" onClick={() => (window.location.href = "/sweepstakes")}>Learn about sweepstakes →</button>
            <button className="secondaryBtn" onClick={() => goEnterApp("sweepstakes_enter")}>Enter app</button>
          </div>
        </div>
      </section>

      <section id="merch" className="section" data-reveal data-delay="0">
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 className="sectionTitle">Merch</h2>
            <p className="sectionSub">LevelUp Pro gear — auto-scrolls, pause on hover.</p>
          </div>
          <button className="secondaryBtn" onClick={() => setMerchOpen(true)}>View all merch</button>
        </div>

        <div className="merchMarquee" aria-label="Merch carousel" data-reveal data-delay="120">
          <div className="merchTrack">
            {[
              { src: "/merch/01-pens.png", title: "Pens", price: "$9" },
              { src: "/merch/02-mousepad.png", title: "Mousepad", price: "$14" },
              { src: "/merch/03-usb-keys.png", title: "USB Keys", price: "$19" },
              { src: "/merch/04-mug.png", title: "Mug", price: "$12" },
              { src: "/merch/05-usb-single.png", title: "USB (single)", price: "$12" },
              { src: "/merch/06-hoodie.png", title: "Hoodie", price: "$39" },
              // duplicate for seamless loop
              { src: "/merch/01-pens.png", title: "Pens", price: "$9" },
              { src: "/merch/02-mousepad.png", title: "Mousepad", price: "$14" },
              { src: "/merch/03-usb-keys.png", title: "USB Keys", price: "$19" },
              { src: "/merch/04-mug.png", title: "Mug", price: "$12" },
              { src: "/merch/05-usb-single.png", title: "USB (single)", price: "$12" },
              { src: "/merch/06-hoodie.png", title: "Hoodie", price: "$39" },
            ].map((it, idx) => (
              <button key={idx} className="merchItemCard" type="button" onClick={() => setMerchOpen(true)}>
                <img src={it.src} alt={it.title} />
                <div className="meta">
                  <b>{it.title}</b>
                  <small>{it.price}</small>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>


      <section id="about" className="section" data-reveal data-delay="0">
        <h2 className="sectionTitle">About Us</h2>
        <p className="sectionSub">LevelUp Pro is built to turn IT training into measurable progress — skills, proof, and real outcomes.</p>

        <div className="grid3" style={{ marginTop: 12 }}>
          <button className={aboutOpen === "company" ? "featureCard aboutCard selected" : "featureCard aboutCard"} type="button" onClick={() => setAboutOpen((v) => (v === "company" ? null : "company"))}>
            <b>Company</b>
            <p className="muted" style={{ marginTop: 8 }}>Mission, values, and who LevelUp is for.</p>
          </button>
          <button className={aboutOpen === "product" ? "featureCard aboutCard selected" : "featureCard aboutCard"} type="button" onClick={() => setAboutOpen((v) => (v === "product" ? null : "product"))}>
            <b>Product</b>
            <p className="muted" style={{ marginTop: 8 }}>How the platform works + what’s coming next.</p>
          </button>
          <button className={aboutOpen === "contact" ? "featureCard aboutCard selected" : "featureCard aboutCard"} type="button" onClick={() => setAboutOpen((v) => (v === "contact" ? null : "contact"))}>
            <b>Contact</b>
            <p className="muted" style={{ marginTop: 8 }}>Partnerships, support, and business inquiries.</p>
          </button>
        </div>

        {aboutOpen && (
          <div className="aboutWidget" style={{ marginTop: 14 }}>
            {aboutOpen === "company" && (
              <div>
                <b>Our mission</b>
                <p className="muted" style={{ marginTop: 8 }}>Make IT career growth feel like a game — but with real hiring outcomes. Build skills, earn proof, and show recruiters you can deliver.</p>
              </div>
            )}
            {aboutOpen === "product" && (
              <div>
                <b>What you get</b>
                <p className="muted" style={{ marginTop: 8 }}>Practice → XP → unlocks → interview simulations → portfolio skills. Rewards are server-verified and your progress becomes a shareable profile.</p>
              </div>
            )}
            {aboutOpen === "contact" && (
              <div>
                <b>Reach out</b>
                <p className="muted" style={{ marginTop: 8 }}>Want to partner, sponsor prizes, or roll LevelUp Pro out for a team? Add your contact details here when ready.</p>
              </div>
            )}

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="secondaryBtn" type="button" onClick={() => goEnterApp("about_enter")}>Enter app</button>
              <button className="secondaryBtn" type="button" onClick={() => setAboutOpen(null)}>Close</button>
            </div>
          </div>
        )}
      </section>

      <footer className="footer">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <b>LevelUp Pro</b>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Gamified IT training platform • 2026</div>
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            © {new Date().getFullYear()} LevelUp Pro • <span style={{ opacity: 0.85 }}>All rights reserved</span>
          </div>
        </div>
      </footer>
      <MerchModal open={merchOpen} onClose={() => setMerchOpen(false)} />
</main>
  );
}
