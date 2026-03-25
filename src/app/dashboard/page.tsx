"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ProgressBar from "@/components/ProgressBar";
import AdaptiveLearningCard from "@/components/AdaptiveLearningCard";
import MerchModal from "@/components/MerchModal";
import MockInterviewModal from "@/components/MockInterviewModal";
import PracticeMiniGameModal from "@/components/PracticeMiniGameModal";
import AvatarMenu from "@/components/AvatarMenu";
import WhatsNextPanel from "@/components/WhatsNextPanel";
import LootVaultModal from "@/components/LootVaultModal";
import AuthGateCard from "@/components/AuthGateCard";
import GoogleLoginButton from "@/components/ui/GoogleLoginButton";
import { getActiveUser, setActiveUserId, syncAuthenticatedUser } from "@/lib/userStore";
import { XP_PER_LEVEL, xpIntoCurrentLevel, levelFromXp, levelTitleFromLevel } from "@/lib/progression";
import { addActivity, getActivities, clearActivitiesByType, clearActivities, removeActivity, type ActivityItem } from "@/lib/activityStore";

type Eligibility = {
  eligible: boolean;
  readiness: number;
  xp: number;
  reason: string;
};

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  scheduledAt?: string | null;
  createdAt: string;
};

type Badge = { id: string; label: string; issuedAt: string; expiresAt: string; code: string };
type Offer = { id: string; title: string; salaryText: string; createdAt: string; companyName: string; roleLabel: string };
type LearningRow = { domain: string; mastery: number; accuracy: number; currentDifficulty: number; correctCount: number; wrongCount: number };
type CareerMatchRow = { id: string; title: string; domain: string; description: string; url: string; location?: string; salary?: string; minLevel: number; minMastery: number };
type SweepstakesSummary = { current?: any | null; user?: any | null; campaigns?: any[] }


const FREE_SESSION_COOLDOWN_MS = 30 * 60 * 1000;

function getFreeSessionCooldownKey(userId: string | null) {
  return `lu_free_session_cooldown_v1:${userId || "anon"}`;
}

function labelPos(p: string){
  if (p === "HELPDESK_SUPPORT") return "Helpdesk Support";
  if (p === "DESKTOP_TECHNICIAN") return "Desktop Technician";
  if (p === "CLOUD_ENGINEER") return "Cloud Engineer";
  return p;
}

function RoleCard(props: { title: string; desc: string; icon: string; selected: boolean; onClick: () => void }){
  return (
    <button className={"luRoleCard" + (props.selected ? " selected" : "")} onClick={props.onClick} type="button">
      <div className="luRoleIcon" aria-hidden="true">{props.icon}</div>
      <div className="luRoleTitle">{props.title}</div>
      <div className="luRoleDesc">{props.desc}</div>
      <div className="luRoleCheck" aria-hidden="true">{props.selected ? "✓" : ""}</div>
    </button>
  );
}

function prettyType(t: string){
  if (t === "HR_INVITE") return "Hiring Manager Ping";
  if (t === "TECH_INTERVIEW_READY") return "Tech Interview Ready";
  if (t === "LOOT_BOX_EARNED") return "Reward";
  if (t === "SWEEPSTAKES_ENTRY") return "Sweepstakes";
  return t;
}

export default function Dashboard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userLabel, setUserLabel] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [localXp, setLocalXp] = useState<number>(0);
  const [localLevel, setLocalLevel] = useState<number>(1);

  const [elig, setElig] = useState<Eligibility | null>(null);
  const [user, setUser] = useState<{ startingPosition: string | null } | null>(null);
  const [showPositionModal, setShowPositionModal] = useState(false);
  const [merchOpen, setMerchOpen] = useState(false);
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [positionTrainingOpen, setPositionTrainingOpen] = useState(false);
  const [certPracticeOpen, setCertPracticeOpen] = useState(false);
  const [testNowOpen, setTestNowOpen] = useState(false);
  const [mockInterviewOpen, setMockInterviewOpen] = useState(false);
  const [positionChangeMode, setPositionChangeMode] = useState(false);
  const [pendingPos, setPendingPos] = useState<string | null>(null);
  const [posSaving, setPosSaving] = useState(false);

  const [notes, setNotes] = useState<Notification[]>([]);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(false);
  const [hrPassed, setHrPassed] = useState<boolean>(false);
  const [lootOpen, setLootOpen] = useState(false);
  const [learningRows, setLearningRows] = useState<LearningRow[]>([]);
  const [overallMastery, setOverallMastery] = useState<number>(0);
  const [careerMatches, setCareerMatches] = useState<CareerMatchRow[]>([]);
  const [sweepSummary, setSweepSummary] = useState<SweepstakesSummary | null>(null);
  const [subscriptionTier, setSubscriptionTier] = useState<string>("FREE");
  const [freeStartCooldownUntil, setFreeStartCooldownUntil] = useState<number>(0);
  const [cooldownNow, setCooldownNow] = useState<number>(Date.now());

  // Level-up detection (notification-only; user opens vault when ready)
  const prevLevelRef = useRef<number>(0);

  const hasHRInvite = useMemo(() => notes.some(n => n.type === "HR_INVITE"), [notes]);
  const hasTechReady = useMemo(() => notes.some(n => n.type === "TECH_INTERVIEW_READY"), [notes]);

  // Prefer local XP (from interviews / practice) so the dashboard reacts immediately.
  const xp = useMemo(() => (localXp ?? elig?.xp ?? 0), [localXp, elig]);
  // Show progress within the CURRENT level.
  const levelSpan = XP_PER_LEVEL;
  const xpIntoLevel = xpIntoCurrentLevel(xp);
  const levelMax = levelSpan;
  const normalizedTier = String(subscriptionTier || "FREE").toUpperCase();
  const tierLabel = normalizedTier === "PREMIUM" ? "Premium" : normalizedTier === "PRO" ? "Pro" : "Free";
  const tierBadgeStyle = normalizedTier === "PREMIUM"
    ? { color: "#eef3ff", background: "linear-gradient(135deg, rgba(230,236,244,0.26), rgba(130,140,156,0.24))", border: "1px solid rgba(220,228,236,0.55)", boxShadow: "0 0 12px rgba(220,228,236,0.18)" }
    : normalizedTier === "PRO"
      ? { color: "#9ad2ff", background: "linear-gradient(135deg, rgba(58,124,255,0.24), rgba(18,64,160,0.18))", border: "1px solid rgba(96,166,255,0.45)", boxShadow: "0 0 12px rgba(74,126,255,0.18)" }
      : { color: "#ffca7a", background: "linear-gradient(135deg, rgba(255,156,48,0.20), rgba(156,86,18,0.16))", border: "1px solid rgba(255,176,88,0.38)", boxShadow: "0 0 10px rgba(255,153,0,0.12)" };
  const isFreeTier = String(subscriptionTier || "FREE").toUpperCase() === "FREE";
  const hasFreeStartCooldown = isFreeTier && (localLevel || 1) >= 3 && freeStartCooldownUntil > cooldownNow;
  const freeStartCooldownRemainingMs = Math.max(0, freeStartCooldownUntil - cooldownNow);
  const freeStartCooldownLabel = `${Math.floor(freeStartCooldownRemainingMs / 60000)}m ${Math.floor((freeStartCooldownRemainingMs % 60000) / 1000)}s`;

  function setLaunchGate(target: "position-training" | "cert-mcq" | "test-now") {
    try {
      localStorage.setItem(
        "lu_module_gate_v1",
        JSON.stringify({ target, exp: Date.now() + 2 * 60 * 1000 })
      );
    } catch {}
  }
  function armFreeSessionCooldown() {
    if (!isFreeTier || (localLevel || 1) < 3) return;
    const until = Date.now() + FREE_SESSION_COOLDOWN_MS;
    setFreeStartCooldownUntil(until);
    try { localStorage.setItem(getFreeSessionCooldownKey(userId), String(until)); } catch {}
  }

  function startLeveledMode(mode: "position" | "cert" | "test") {
    if (hasFreeStartCooldown) return;
    setShowLaunchModal(false);
    if (mode === "position") setPositionTrainingOpen(true);
    if (mode === "cert") setCertPracticeOpen(true);
    if (mode === "test") setTestNowOpen(true);
    armFreeSessionCooldown();
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(getFreeSessionCooldownKey(userId));
      const until = Number(raw || 0);
      setFreeStartCooldownUntil(Number.isFinite(until) ? until : 0);
    } catch {
      setFreeStartCooldownUntil(0);
    }
  }, [userId]);

  useEffect(() => {
    if (!hasFreeStartCooldown) return;
    const t = window.setInterval(() => setCooldownNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [hasFreeStartCooldown]);

  async function refresh(activeUserId: string) {
    setLoading(true);
    try {
      // Re-hydrate local XP/level on refresh (in case another modal updated it).
      try {
        const u = getActiveUser();
        setLocalXp(u.xp ?? 0);
        setLocalLevel(levelFromXp(u.xp ?? 0));
        setUserLabel(u.displayName);
        setActivity(getActivities(u.id));

        // Sync local/demo XP upward to the server so leaderboards match.
        // (Never decreases server XP.)
        const local = Number(u.xp ?? 0);
        if (Number.isFinite(local) && local > 0) {
          fetch("/api/users/sync-xp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: u.id, xp: local }),
          }).catch(() => {});
        }
      } catch {}

      const res = await fetch(`/api/users/summary?userId=${encodeURIComponent(activeUserId)}`);
      const text = await res.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      if (!res.ok) throw new Error(data?.error ?? data?.detail ?? text ?? "Failed");
      setNotes(data.notifications ?? []);
      setUser(data.user ?? null);
      setSubscriptionTier(String(data.subscriptionTier ?? data.user?.subscriptionTier ?? "FREE").toUpperCase());
      setLocalXp(Number(data.xp ?? data.user?.xp ?? 0) || 0);
      setLocalLevel(levelFromXp(Number(data.xp ?? data.user?.xp ?? 0) || 0));
      setTokenBalance(Number(data.tokenBalance ?? data.user?.tokenBalance ?? 0) || 0);
      if (!data.user?.startingPosition) { setPositionChangeMode(false); setPendingPos(null); setShowPositionModal(true); }

      setBadges(data.badges ?? []);
      setOffers(data.offers ?? []);
      setElig((prev) => prev ? { ...prev, xp: data.xp ?? prev.xp } : null);

      const hrRes = await fetch(`/api/interviews/hr/status?userId=${encodeURIComponent(activeUserId)}`);
      const hrText = await hrRes.text();
      let hrData: any = null;
      try { hrData = hrText ? JSON.parse(hrText) : null; } catch { hrData = null; }
      if (hrRes.ok) setHrPassed(Boolean(hrData?.passed));

      try {
        const lpRes = await fetch('/api/learning/profile', { cache: 'no-store' as any });
        const lpText = await lpRes.text();
        let lpData: any = null;
        try { lpData = lpText ? JSON.parse(lpText) : null; } catch { lpData = null; }
        if (lpRes.ok) {
          const rows: any[] = Array.isArray(lpData?.profile?.masteryByDomain) ? lpData.profile.masteryByDomain : [];
          setLearningRows(rows);
          const overall = Number(lpData?.profile?.overallMastery ?? (rows.length ? rows.reduce((sum, row) => sum + Number((row as any)?.mastery || 0), 0) / rows.length : 0));
          setOverallMastery(overall);
          try {
            const domains = rows.filter((r: any) => Number(r?.mastery || 0) >= 40).map((r: any) => String(r.domain || '').toUpperCase());
            const params = new URLSearchParams();
            params.set('level', String(localLevel || (getActiveUser() as any)?.level || 1));
            params.set('domains', domains.join(','));
            for (const row of rows) params.set(`m_${String(row.domain || '').toUpperCase()}`, String(Number(row?.mastery || 0)));
            const cmRes = await fetch(`/api/career-matches?${params.toString()}`, { cache: 'no-store' as any });
            const cmData = await cmRes.json().catch(() => null);
            if (cmRes.ok) setCareerMatches(Array.isArray(cmData?.rows) ? cmData.rows : []);
          } catch {}
        }
      } catch {}
      try {
        const swRes = await fetch(`/api/sweepstakes/summary`, { cache: "no-store" as any });
        const swData = await swRes.json().catch(() => null);
        if (swRes.ok) setSweepSummary(swData || null);
      } catch {}
    } catch (e: any) {
      console.error(e.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }
  async function confirmPosition(){
    if (!pendingPos) return;
    setPosSaving(true);
    try{
      const res = await fetch("/api/users/set-position", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, startingPosition: pendingPos }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to save position");
      setShowPositionModal(false);
      setPositionChangeMode(false);

      setUser({ startingPosition: pendingPos });
    }catch(e: any){
      console.error(e?.message ?? "Error");
    }finally{
      setPosSaving(false);
    }
  }


  async function checkEligibility() {
    setLoading(true);
    try {
      const res = await fetch("/api/interviews/qualify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed");
      setElig(data);

      if (data.eligible) {
        await fetch("/api/notifications/create-hr-invite", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId }),
        });
      }
      if (userId) await refresh(userId);
    } catch (e: any) {
      console.error(e.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const authErr = params.get("authError");
        if (authErr && mounted) setAuthError(authErr);

        const authRes = await fetch("/api/auth/me", { cache: "no-store" as any });
        if (!authRes.ok) {
          if (mounted) {
            setAuthChecked(true);
            setUserId(null);
          }
          return;
        }

        const authData = await authRes.json().catch(() => null);
        const authUser = authData?.user;
        if (!authUser?.id) {
          if (mounted) setAuthChecked(true);
          return;
        }

        const emailNorm = String(authUser.email || "").trim().toLowerCase();
        setIsAdminUser(Boolean(authUser.isAdmin) || emailNorm === "tyrone.rosejr@gmail.com");
        const synced = syncAuthenticatedUser({
          id: authUser.id,
          displayName: authUser.name || authUser.email,
          email: authUser.email,
          xp: Number(authUser.xp ?? 0),
        });

        if (!mounted) return;
        setUserId(synced.id);
        setUserLabel(synced.displayName);
        setUserAvatar(authUser.picture ?? null);
        setLocalXp(synced.xp ?? 0);
        setLocalLevel(levelFromXp(synced.xp ?? 0));
        setActivity(getActivities(synced.id));
        setAuthChecked(true);
      } catch {
        if (mounted) setAuthChecked(true);
      }
    })();

    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!userId) return;
    const prev = Number(prevLevelRef.current ?? 0);
    const next = Number(localLevel ?? 1);
    // On initial mount, just sync the ref so refresh doesn't re-grant loot.
    if (prev === 0) {
      prevLevelRef.current = next;
      return;
    }
    if (next <= prev) {
      prevLevelRef.current = next;
      return;
    }

    prevLevelRef.current = next;

    // Server-backed loot + persistent notification (single source of truth)
    fetch("/api/loot/earn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, xpAfter: xp, source: "level_up" }),
    })
      .then(() => {
        // refresh notifications so server notices appear without reload
        try { userId && refresh(userId); } catch {}
      })
      .catch(() => {});
  }, [localLevel, userId, xp]);

  useEffect(() => {
    if (!userId) return;
    refresh(userId);
  }, [userId]);

  useEffect(() => {
    if (mockInterviewOpen) return;
    // When the interview modal closes, refresh local XP/level so the UI updates instantly.
    try {
      const u = getActiveUser();
      setLocalXp(u.xp ?? 0);
      setLocalLevel(levelFromXp(u.xp ?? 0));
      setUserLabel(u.displayName);
      setActivity(getActivities(u.id));
    } catch {}
  }, [mockInterviewOpen]);

  const highlight = notes.find(n => n.type === "TECH_INTERVIEW_READY") ?? notes[0];

  const combinedNotes = useMemo(() => {
    const local = activity.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      body: a.body,
      createdAt: a.createdAt,
      _source: "local",
    })) as any[];
    const server = (notes as any[]).map((n) => ({ ...n, _source: "server" }));
    return [...local, ...server].slice(0, 8);
  }, [activity, notes]);

  const recommendedRoles = useMemo(() => {
    if ((localLevel || 1) < 7) return [] as CareerMatchRow[];
    if (careerMatches.length) return careerMatches;
    return [] as CareerMatchRow[];
  }, [careerMatches, localLevel]);

  async function markNotificationReadAndRemove(n: any) {
    if (!userId) return;
    // Local activity notification
    if (n._source === "local") {
      try {
        removeActivity(userId, n.id);
        setActivity(getActivities(userId));
      } catch {}
      return;
    }

    // Server notification
    try {
      await fetch("/api/notifications/clear", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, ids: [n.id] }),
      });
    } catch {}
    setNotes((prev) => prev.filter((x) => x.id !== n.id));
  }

  if (!authChecked) {
    return (
      <div className="page"><div className="container" style={{ maxWidth: 1120 }}><div className="card" style={{ padding: 18 }}><div style={{ fontWeight: 800, fontSize: 18 }}>Checking sign-in…</div></div></div></div>
    );
  }

  if (!userId) {
    return <AuthGateCard error={authError} />;
  }

  return (
    <>
      {!userId ? <AuthGateCard error={authError} /> : null}

      <div className="dashBg" aria-hidden="true" />

      <header className="navTop" style={{ marginBottom: 18 }}>
        <div className="navTopInner">
        <div className="brandLock">
          <div className="brandMark brandMark--logo"><img src="/levelup-pro-mark.svg" alt="LevelUp Pro" className="brandMarkImg" /></div>
          <div className="brandText">
            <b>LevelUp Pro</b>
            <small>Dashboard</small>
          </div>
        </div>

        <nav className="navLinks">
          <a href="/dashboard">Dashboard</a>
          <a href="/training">Training</a>
          <a href="/certifications">Certifications</a>
          <a href="/rewards">Rewards</a>
          <a href="/sweepstakes">Sweepstakes</a>
          <a href="#" onClick={(e) => (e.preventDefault(), setMerchOpen(true))}>Merch</a>
          {isAdminUser ? <a href="/admin">Admin</a> : null}
        </nav>

        <div className="navActions">
          <button className="secondaryBtn" type="button" onClick={() => (window.location.href = "/start#pricing")}>Pricing</button>
          <GoogleLoginButton authenticated />
          <button className="primaryBtn" type="button" onClick={() => setShowLaunchModal(true)}>Start Now →</button>

          {/* Token balance pill */}
          <div
            className="card"
            style={{
              padding: "8px 10px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              borderRadius: 999,
              background: "rgba(255,255,255,0.06)",
            }}
            title="Tokens are earned via loot boxes and can be redeemed for rewards."
          >
            <span aria-hidden="true" style={{ fontSize: 14 }}>🪙</span>
            <span style={{ fontWeight: 900, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
              {Number.isFinite(tokenBalance) ? tokenBalance : 0}
            </span>
          </div>
          <div
            className="card"
            style={{
              padding: "8px 10px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              borderRadius: 999,
              background: "rgba(255,255,255,0.06)",
            }}
            title="XP is earned across interviews and practice. Levels auto-save to your local profile."
          >
            <span style={{ fontWeight: 900, fontSize: 12 }}>Lvl {localLevel}</span>
            <span style={{ opacity: 0.8, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>XP {xp}</span>
          </div>
          <AvatarMenu
            userLabel={userLabel ?? userId}
            avatarUrl={userAvatar}
            onLogout={async () => {
              try {
                await fetch("/api/auth/logout", { method: "POST" });
              } catch {}
              setUserId(null);
              setUserLabel(null);
              setUserAvatar(null);
              window.location.href = "/";
            }}
          />
        </div>
        </div>
      </header>

      {showLaunchModal && (
        <div className="luModalOverlay">
          <div className="luModal" role="dialog" aria-modal="true" aria-label="Choose what to start">
            <div className="luModalHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <b style={{ fontSize: 18 }}>Start leveling</b>
                <div><small className="luHint">Choose what you want to work on right now.</small></div>
              </div>
              <button className="secondaryBtn" type="button" onClick={() => setShowLaunchModal(false)}>✕</button>
            </div>

            <div className="luModalBody">
              {hasFreeStartCooldown && (
                <div className="card" style={{ marginBottom: 12, padding: 12, borderColor: "rgba(255,210,120,0.28)", background: "rgba(255,184,77,0.08)" }}>
                  <b style={{ display: "block", marginBottom: 4 }}>Free tier cooldown active</b>
                  <small>You can start another session in {freeStartCooldownLabel}. Upgrade to Pro to remove cooldowns.</small>
                </div>
              )}
              <div className="luGrid3">
                <button
                  className="luRoleCard"
                  type="button"
                  onClick={() => startLeveledMode("position")}
                >
                  <div className="luRoleIcon" aria-hidden="true">🎯</div>
                  <div className="luRoleTitle">Position training</div>
                  <div className="luRoleDesc">Practice role-based questions and earn XP.</div>
                </button>

                <button
                  className="luRoleCard"
                  type="button"
                  onClick={() => startLeveledMode("cert")}
                >
                  <div className="luRoleIcon" aria-hidden="true">📚</div>
                  <div className="luRoleTitle">Certifications</div>
                  <div className="luRoleDesc">A+, Security+, AZ-900 practice modules.</div>
                </button>

                <button
                  className="luRoleCard"
                  type="button"
                  onClick={() => startLeveledMode("test")}
                >
                  <div className="luRoleIcon" aria-hidden="true">⚡</div>
                  <div className="luRoleTitle">Test now!</div>
                  <div className="luRoleDesc">Timed mini-check to benchmark your level.</div>
                </button>

              </div>
            </div>
          </div>
        </div>
      )}

      <PracticeMiniGameModal
        open={positionTrainingOpen}
        kind="position"
        defaultPath={(user?.startingPosition as any) ?? "HELPDESK_SUPPORT"}
        onClose={() => setPositionTrainingOpen(false)}
        onXpChange={(xp, level) => {
          setLocalXp(xp);
          setLocalLevel(level);
        }}
      />

      <LootVaultModal
        open={lootOpen}
        userId={userId}
        onClose={() => setLootOpen(false)}
        onClaimed={() => {
          // Clear LOOT notifications locally + server-side
          try { clearActivitiesByType(userId, ["LOOT_BOX_EARNED"]); setActivity(getActivities(userId)); } catch {}
          fetch('/api/notifications/clear', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId, type: 'LOOT_BOX_EARNED' }) }).catch(() => {});
          // Remove LOOT notifications from the current UI list immediately
          setNotes((prev) => prev.filter((n) => n.type !== 'LOOT_BOX_EARNED'));
          // refresh dashboard data after claim so token balances etc. can be used later
          try { userId && refresh(userId); } catch {}
        }}
      />

      <PracticeMiniGameModal
        open={certPracticeOpen}
        kind="cert"
        onClose={() => setCertPracticeOpen(false)}
        onXpChange={(xp, level) => {
          setLocalXp(xp);
          setLocalLevel(level);
        }}
      />

      <PracticeMiniGameModal
        open={testNowOpen}
        kind="test"
        onClose={() => setTestNowOpen(false)}
        onXpChange={(xp, level) => {
          setLocalXp(xp);
          setLocalLevel(level);
        }}
      />

      {showPositionModal && (
        <div className="luModalOverlay">
          <div className="luModal" role="dialog" aria-modal="true" aria-label="Choose starting position">
            <div className="luModalHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              
              <div>
                <b style={{ fontSize: 18 }}>Choose Your Starting Position</b>
                <div><small className="luHint">This personalizes your learning path. You can change it later.</small></div>
              </div>
              {positionChangeMode && (
                <button className="secondaryBtn" type="button" onClick={() => setShowPositionModal(false)}>✕</button>
              )}
            </div>

            <div className="luModalBody">
              <div className="luGrid3">
                <RoleCard
                  title="Helpdesk Support"
                  desc="Entry-level IT support: tickets, troubleshooting, user support."
                  icon="🧑‍💻"
                  selected={pendingPos === "HELPDESK_SUPPORT"}
                  onClick={() => setPendingPos("HELPDESK_SUPPORT")}
                />
                <RoleCard
                  title="Desktop Technician"
                  desc="Hardware, imaging, endpoint tooling, onsite escalations."
                  icon="🛠️"
                  selected={pendingPos === "DESKTOP_TECHNICIAN"}
                  onClick={() => setPendingPos("DESKTOP_TECHNICIAN")}
                />
                <RoleCard
                  title="Cloud Engineer"
                  desc="Cloud fundamentals, IAM, networking, services, and automation."
                  icon="☁️"
                  selected={pendingPos === "CLOUD_ENGINEER"}
                  onClick={() => setPendingPos("CLOUD_ENGINEER")}
                />
              </div>
            </div>

            <div className="luModalFooter">
              <button className="primary" disabled={!pendingPos || posSaving} onClick={confirmPosition}>
                {posSaving ? "Saving..." : "Start Leveling"}
              </button>
            </div>
          </div>
        </div>
      )}

      <main>
      <div className="bgPattern" />
      <div className="heroBlur" />

      <div className="appContainer">
      <div className="shell">
        <aside className="sidebar">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div className="sidebarLogoBox"><img src="/levelup-pro-mark.svg" alt="LevelUp Pro" className="sidebarLogoImg" /></div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 22, lineHeight: 1.05 }}>LevelUp Pro</div>
              <div><small>Interview Prep</small></div>
            </div>
          </div>

          <button className="primary" style={{ width: "100%", marginTop: 8, opacity: hasFreeStartCooldown ? 0.7 : 1 }} onClick={() => !hasFreeStartCooldown && setShowLaunchModal(true)} disabled={hasFreeStartCooldown} title={hasFreeStartCooldown ? `Free tier cooldown: ${freeStartCooldownLabel}` : undefined}>
            {hasFreeStartCooldown ? `Start Now! (${freeStartCooldownLabel})` : "Start Now!"}
          </button>

          <div style={{ marginTop: 10 }}>
            {(localLevel || 1) >= 5 ? (
              <button className="gold" style={{ width: "100%" }} onClick={() => setMockInterviewOpen(true)}>
                Begin Boss Battle →
              </button>
            ) : (
              <button className="gold" style={{ width: "100%", opacity: 0.65, cursor: "not-allowed" }} disabled title="Unlocks at level 5">
                Begin Boss Battle 🔒
              </button>
            )}
            <small style={{ display: "block", marginTop: 6, opacity: 0.8 }}>
              {(localLevel || 1) >= 5 ? "Boss battle unlocked." : "Unlocks at level 5."}
            </small>
            {hasFreeStartCooldown && <small style={{ display: "block", marginTop: 6, color: "#f5d37b" }}>Free users can start another session in {freeStartCooldownLabel}.</small>}
          </div>

          <hr style={{ margin: "14px 0" }} />

          <h4 style={{ margin: "0 0 8px 0" }}>Progress</h4>

          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <small>{levelTitleFromLevel(localLevel)} • Level {localLevel}</small>
              <small style={{ padding: "2px 10px", borderRadius: 999, fontWeight: 800, letterSpacing: 0.2, ...(tierBadgeStyle as any) }}>{tierLabel}</small>
            </div>
            <div style={{ marginTop: 10 }}>
              <ProgressBar value={Number.isFinite(xpIntoLevel) ? xpIntoLevel : 0} max={levelMax} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, opacity: 0.85 }}>
              <small>XP: {Number.isFinite(xpIntoLevel) ? xpIntoLevel : 0} / {levelMax}</small>
              <small>Tokens: {Number.isFinite(tokenBalance) ? tokenBalance : 0}</small>
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: (((localLevel || 1) >= 5 || elig?.eligible) ? "rgba(120,220,160,0.92)" : "rgba(255,255,255,0.25)"), boxShadow: (((localLevel || 1) >= 5 || elig?.eligible) ? "0 0 10px rgba(120,220,160,0.55)" : "none") }} />
              <small>Boss Battle Eligibility Unlocked!</small>
            </div>
            <div style={{ marginTop: 8, opacity: 0.82 }}><small>Adaptive mastery details are shown in the main panel.</small></div>
          </div>

        </aside>

        <section className="maincol">
          <div className="topbar">
            <div>
              <b>Welcome back</b>
              <div><small>Signed in as <span style={{ opacity: 0.95 }}>{userLabel ?? userId}</span></small></div>
              <div style={{ marginTop: 6 }}><small style={{ padding: "3px 10px", borderRadius: 999, fontWeight: 800, ...(tierBadgeStyle as any) }}>{tierLabel} plan</small></div>
            </div>

            <div className="kpiRow">
              <span className="badge"><b>Path</b>: {user?.startingPosition ? labelPos(user.startingPosition) : "Not set"}</span>
              {user?.startingPosition && (
                <button className="secondaryBtn" type="button" onClick={() => {
                  setPendingPos(user.startingPosition);
                  setPositionChangeMode(true);
                  setShowPositionModal(true);
                }}>
                  Change
                </button>
              )}

              <span className="badge"><b>HR</b>: {hrPassed ? "Passed ✅" : "Not passed"}</span>
              <span className="badge"><b>Tech Ready</b>: {hasTechReady ? "Yes" : "No"}</span>
              <button onClick={() => userId && refresh(userId)} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button>
              <button className="primary" onClick={checkEligibility} disabled={loading}>Check Eligibility</button>
              {hasHRInvite && <button className="primary" onClick={() => window.location.href="/interview/hr"}>Start Boss Battle (HR)</button>}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Notifications</h3>
            {combinedNotes.length ? (
              <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                {combinedNotes.map((n: any) => (
                  <div
                    key={n.id}
                    className={"card " + (n.type === "TECH_INTERVIEW_READY" ? "notifHighlight" : "")}
                    role="button"
                    tabIndex={0}
                    onClick={() => markNotificationReadAndRemove(n)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") markNotificationReadAndRemove(n);
                    }}
                    style={{ cursor: "pointer" }}
                    title="Click to mark as read"
                  >
                    <p style={{ margin: 0 }}><b>{n.title}</b></p>
                    <p style={{ margin: "6px 0" }}><small>{prettyType(n.type)} • {new Date(n.createdAt).toLocaleString()}</small></p>
                    <p style={{ margin: 0 }}>{n.body}</p>
                    {n.scheduledAt && <p style={{ margin: "6px 0 0 0" }}><small>Scheduled: {new Date(n.scheduledAt).toLocaleString()}</small></p>}

                    {(n.type === "LOOT_BOX_EARNED" && !/golden sweepstakes/i.test(`${n.title} ${n.body}`)) && (
                      <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
                        <button
                          className="primary"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Keep the notification until the chest is actually claimed/opened.
                            setLootOpen(true);
                          }}
                        >
                          Open Loot Vault
                        </button>
                        <small style={{ opacity: 0.75 }}>Your rewards stack up until you open them.</small>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p><small>No notifications yet.</small></p>
            )}
          </div>



          {Array.isArray(sweepSummary?.campaigns) && sweepSummary.campaigns.length ? (
            <div className="card" style={{ marginTop: 14, borderColor: 'rgba(255,215,90,.22)', boxShadow: '0 0 0 1px rgba(255,215,90,.06) inset' }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap' }}>
                <div>
                  <h3 style={{ margin: 0 }}>Active sweepstakes</h3>
                  <div><small>Campaigns you are currently entered in. Click a drawing card to open that campaign.</small></div>
                </div>
              </div>
              <div style={{ marginTop: 12, display:'grid', gap:10 }}>
                {sweepSummary.campaigns
                  .filter((c: any) => (c?.status === 'ACTIVE' || c?.isLive) && Number(sweepSummary?.user?.entriesByCampaign?.[String(c.id)] || 0) > 0)
                  .map((c: any) => (
                    <a
                      key={c.id}
                      href={`/sweepstakes?campaign=${encodeURIComponent(String(c.id))}`}
                      className="featureCard"
                      style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap', textDecoration:'none', color:'inherit', cursor:'pointer' }}
                    >
                      <div>
                        <div><b>{c.title}</b> • <small>{c.prizePoolLabel || 'Prize drawing'}</small></div>
                        <div style={{ marginTop:8, display:'flex', gap:10, flexWrap:'wrap' }}>
                          <span className="badge">Your entries: {Number(sweepSummary?.user?.entriesByCampaign?.[String(c.id)] || 0)}</span>
                          <span className="badge">Participants: {Number(c.totalParticipants || 0)}</span>
                          <span className="badge">Entries: {Number(c.totalEntries || 0)}</span>
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                        <span className="badge">Tokens: {Number(sweepSummary?.user?.tokenBalance || 0)}</span>
                        <span className="badge">Draw closes: {c?.endsAt ? new Date(c.endsAt).toLocaleString() : 'TBD'}</span>
                      </div>
                    </a>
                  ))}
              </div>
            </div>
          ) : null}

          <AdaptiveLearningCard overallMastery={overallMastery} rows={learningRows} />

          <div className="card" style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <h3 style={{ margin: 0 }}>Career Matches</h3>
                <div><small>{(localLevel || 1) >= 7 ? "Open roles appear when a mastery domain reaches 40%+." : "Reach level 7 to unlock career matches based on your mastery."}</small></div>
              </div>
              <span className="badge">AI-guided</span>
            </div>
            <div className="careerMatchGrid" style={{ marginTop: 14 }}>
              {recommendedRoles.length ? recommendedRoles.map((role) => (
                <a key={role.id} className="careerMatchTile" href={role.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="careerMatchTitle">{role.title}</div>
                  <div className="careerMatchMeta">{role.description}</div>
                  <div className="careerMatchMeta" style={{ marginTop: 8 }}><b>{role.domain}</b>{role.location ? ` • ${role.location}` : ''}{role.salary ? ` • ${role.salary}` : ''}</div>
                </a>
              )) : (
                <div className="careerMatchTile">
                  <div className="careerMatchTitle">Career matches locked</div>
                  <div className="careerMatchMeta">Continue leveling and build a domain above 40% mastery to reveal tailored job links here.</div>
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <WhatsNextPanel
              hrPassed={hrPassed}
              techReady={hasTechReady}
              onOpenStartNow={() => setShowLaunchModal(true)}
              onOpenMockInterview={() => setMockInterviewOpen(true)}
            />
          </div>


          {/* Removed duplicate progress bar in main column (sidebar already contains the primary progress UI). */}

          {/* "What's next" lives in a premium modal now (open via top bar). */}
        </section>
            </div>
    </div>
    </main>
      <MerchModal open={merchOpen} onClose={() => setMerchOpen(false)} />
      <MockInterviewModal open={mockInterviewOpen} onClose={() => setMockInterviewOpen(false)} />
</>
  );
}
