"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type KnowledgeBlock = {
  id: string;
  sourceBlockId: string;
  title: string;
  setName: string;
  domain: string;
  lane: string;
  startingPosition?: string | null;
  certExam?: string | null;
  difficulty: number;
  stage: number;
  tags: string[];
  source?: string | null;
  status: string;
  contentJson: any;
  _count?: { generatedQuestions: number };
};

type GeneratedQuestion = {
  id: string;
  knowledgeBlockId: string;
  prompt: string;
  type: string;
  difficulty: number;
  explanation?: string | null;
  tags: string[];
  data: any;
  choices?: string[] | null;
  correctIndex?: number | null;
  reviewStatus: string;
  editorNotes?: string | null;
  knowledgeBlock?: { title: string; setName: string };
};

type LiveQuestion = {
  id: string;
  setId: string;
  prompt: string;
  type: string;
  difficulty: number;
  explanation?: string | null;
  tags: string[];
  data: any;
  choices?: string[] | null;
  correctIndex?: number | null;
  sortOrder: number;
  testNowEligible: boolean;
  isGoldenEligible: boolean;
  goldenWeight: number;
  goldenBonusXp: number;
};

type GoldenTracking = {
  knowledgeBlockId: string;
  setId: string;
  lane: string;
  totalLiveQuestions: number;
  testNowEligibleCount: number;
  goldenEligibleCount: number;
  totalGoldenSpawns: number;
  correctGoldenAnswers: number;
  missedGoldenAnswers: number;
  unansweredGoldenSpawns: number;
  liveGoldenQuestions: Array<{
    id: string;
    prompt: string;
    type: string;
    difficulty: number;
    goldenWeight: number;
    goldenBonusXp: number;
    testNowEligible: boolean;
  }>;
  recentGoldenSpawns: Array<{
    sessionQuestionId: string;
    questionId: string | null;
    orderIndex: number;
    goldenBonusXp: number | null;
    answered: boolean;
    isCorrect: boolean | null;
    answeredAt?: string | null;
    createdAt: string;
    session: {
      id: string;
      userId: string;
      createdAt: string;
      completedAt?: string | null;
      status: string;
      mode: string;
      setId?: string | null;
    };
  }>;
};

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

const SAMPLE_BLOCK = `[
  {
    "id": "net-foundations-001",
    "title": "Networking Foundations",
    "setName": "Networking Foundations",
    "domain": "NETWORKING",
    "lane": "TEST_NOW",
    "difficulty": 1,
    "stage": 1,
    "tags": ["networking", "fundamentals"],
    "facts": [
      { "statement": "HTTPS uses port 443", "answer": "443", "subject": "HTTPS", "category": "port", "distractors": ["80", "22", "53"], "questionTypes": ["multiple_choice", "fill_blank", "multi_select"] },
      { "statement": "DNS translates hostnames to IP addresses", "answer": "Translates hostnames to IP addresses" }
    ],
    "definitions": [
      { "term": "NAT", "definition": "Translates private IP addresses to public addresses", "aliases": ["Network Address Translation"] }
    ],
    "procedures": [
      { "title": "Basic connectivity troubleshooting", "steps": ["Verify connection", "Check IP config", "Ping gateway", "Test external connectivity"] }
    ],
    "commands": [
      { "platform": "windows", "purpose": "View IP configuration", "command": "ipconfig", "aliases": ["ipconfig /all"] }
    ],
    "scenarios": [
      { "scenario": "A user can reach internal apps but not external websites.", "bestAction": "Check DNS resolution and upstream internet connectivity." }
    ],
    "distractors": ["80", "22", "53", "389"]
  }
]`;

export default function AdminContentStudioPage() {
  const [tab, setTab] = useState<"import" | "review">("import");
  const [rawJson, setRawJson] = useState(SAMPLE_BLOCK);
  const [message, setMessage] = useState("");
  const [blocks, setBlocks] = useState<KnowledgeBlock[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string>("");
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [liveQuestions, setLiveQuestions] = useState<LiveQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [savingId, setSavingId] = useState<string>("");
  const [goldenTracking, setGoldenTracking] = useState<GoldenTracking | null>(null);
  const [reviewPanel, setReviewPanel] = useState<"generated" | "live">("generated");
  const [liveSearch, setLiveSearch] = useState("");
  const [liveFilter, setLiveFilter] = useState<"all" | "test-now" | "golden">("all");
  const [selectedLiveIds, setSelectedLiveIds] = useState<string[]>([]);
  const [bulkWeight, setBulkWeight] = useState(2);
  const [bulkBonusXp, setBulkBonusXp] = useState(75);
  const importRef = useRef<HTMLInputElement | null>(null);

  const selectedBlock = useMemo(
    () => blocks.find((b) => b.id === selectedBlockId) || null,
    [blocks, selectedBlockId]
  );

  const filteredLiveQuestions = useMemo(() => {
    const search = liveSearch.trim().toLowerCase();
    return liveQuestions.filter((q) => {
      if (liveFilter === "test-now" && !q.testNowEligible) return false;
      if (liveFilter === "golden" && !q.isGoldenEligible) return false;
      if (!search) return true;
      return [q.prompt, q.type, ...(q.tags || [])].join(" ").toLowerCase().includes(search);
    });
  }, [liveQuestions, liveSearch, liveFilter]);

  const allFilteredLiveSelected = filteredLiveQuestions.length > 0 && filteredLiveQuestions.every((q) => selectedLiveIds.includes(q.id));

  async function loadBlocks() {
    const res = await fetch("/api/admin/knowledge-blocks", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error((data as any)?.error || "Failed to load knowledge blocks");
    const blocksArr = asArray(data.blocks) as KnowledgeBlock[];
    setBlocks(blocksArr);
    if (!selectedBlockId && blocksArr[0]?.id) setSelectedBlockId(blocksArr[0].id);
  }

  async function loadQuestions(blockId: string) {
    if (!blockId) {
      setQuestions([]);
      return;
    }
    const res = await fetch(`/api/admin/generated-questions?knowledgeBlockId=${encodeURIComponent(blockId)}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to load generated questions");
    setQuestions(asArray(data.questions));
  }

  async function loadGoldenTracking(blockId: string) {
    if (!blockId) {
      setGoldenTracking(null);
      return;
    }
    const res = await fetch(`/api/admin/golden-tracking?knowledgeBlockId=${encodeURIComponent(blockId)}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to load golden tracking");
    setGoldenTracking(data.tracking || null);
  }

  async function loadLiveQuestions(setId?: string | null) {
    if (!setId) {
      setLiveQuestions([]);
      setSelectedLiveIds([]);
      return;
    }
    const res = await fetch(`/api/admin/questions?setId=${encodeURIComponent(setId)}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to load live questions");
    setLiveQuestions(asArray(data.questions));
    setSelectedLiveIds([]);
  }

  async function refreshReviewData(blockId: string) {
    await loadQuestions(blockId);
    await loadGoldenTracking(blockId).catch(() => null);
  }

  useEffect(() => {
    let mounted = true;
    async function checkAdmin() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" as any });
        const data = await res.json().catch(() => null);
        if (!mounted) return;
        if (!res.ok || !data?.user?.isAdmin) {
          window.location.href = "/dashboard";
          return;
        }
        await loadBlocks().catch((e) => setMessage(e.message));
      } finally {
        if (mounted) setAuthChecked(true);
      }
    }
    checkAdmin();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    loadQuestions(selectedBlockId).catch((e) => setMessage(e.message));
    loadGoldenTracking(selectedBlockId).catch((e) => setMessage(e.message));
  }, [selectedBlockId, authChecked]);

  useEffect(() => {
    if (!authChecked) return;
    loadLiveQuestions(goldenTracking?.setId).catch((e) => setMessage(e.message));
  }, [goldenTracking?.setId, authChecked]);

  async function importBlocks() {
    setLoading(true);
    setMessage("");
    try {
      const blocksToSave = JSON.parse(rawJson);
      const res = await fetch("/api/admin/knowledge-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Array.isArray(blocksToSave) ? { blocks: blocksToSave } : blocksToSave),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Import failed");
      setMessage(`Saved ${data.count} knowledge block(s).`);
      await loadBlocks();
      await loadGoldenTracking(selectedBlockId).catch(() => null);
    } catch (e: any) {
      setMessage(e?.message || "Import failed");
    } finally {
      setLoading(false);
    }
  }

  async function importFile(file: File) {
    const text = await file.text();
    setRawJson(text);
    setTab("import");
    setMessage(`Loaded ${file.name}. Review the JSON, then click Save blocks.`);
  }

  async function syncFactBankToLive() {
    setSyncing(true);
    setMessage("");
    try {
      const blocksToSave = JSON.parse(rawJson);
      const res = await fetch("/api/admin/fact-bank-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocks: Array.isArray(blocksToSave) ? blocksToSave : [blocksToSave] }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Fact bank sync failed");
      const s = data?.summary || {};
      setMessage(`Synced ${s.blocksImported || 0} block(s), generated ${s.generatedQuestions || 0} question(s), and published ${s.publishedQuestions || 0} live question(s).`);
      await loadBlocks();
      if (selectedBlockId) await refreshReviewData(selectedBlockId);
      setTab("review");
      setReviewPanel("live");
    } catch (e: any) {
      setMessage(e?.message || "Fact bank sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function generateForSelected() {
    if (!selectedBlockId) return;
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowledgeBlockIds: [selectedBlockId] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Generation failed");
      setMessage(`Generated ${data.generatedCount} question(s). Review before publishing.`);
      await loadBlocks();
      await refreshReviewData(selectedBlockId);
      setTab("review");
      setReviewPanel("generated");
    } catch (e: any) {
      setMessage(e?.message || "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  async function updateQuestion(question: GeneratedQuestion, patch: Partial<GeneratedQuestion>) {
    setSavingId(question.id);
    setMessage("");
    try {
      const res = await fetch("/api/admin/generated-questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: question.id, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Save failed");
      await loadQuestions(selectedBlockId);
      await loadGoldenTracking(selectedBlockId).catch(() => null);
      setMessage("Question updated.");
    } catch (e: any) {
      setMessage(e?.message || "Save failed");
    } finally {
      setSavingId("");
    }
  }

  async function publishSelected() {
    if (!selectedBlockId) return;
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/publish-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowledgeBlockId: selectedBlockId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Publish failed");
      setMessage(`Published ${data.publishedCount} question(s) to live QuestionSet ${data.setId}.`);
      await loadBlocks();
      await refreshReviewData(selectedBlockId);
      setReviewPanel("live");
    } catch (e: any) {
      setMessage(e?.message || "Publish failed");
    } finally {
      setLoading(false);
    }
  }

  async function updateLiveQuestion(id: string, patch: Partial<LiveQuestion>) {
    setSavingId(id);
    setMessage("");
    try {
      const res = await fetch("/api/admin/questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Live question update failed");
      await loadLiveQuestions(goldenTracking?.setId);
      await loadGoldenTracking(selectedBlockId).catch(() => null);
      setMessage("Live question updated.");
    } catch (e: any) {
      setMessage(e?.message || "Live question update failed");
    } finally {
      setSavingId("");
    }
  }

  async function bulkUpdateLiveQuestions(patch: Partial<LiveQuestion>) {
    if (!selectedLiveIds.length) return;
    setSavingId("bulk-live");
    setMessage("");
    try {
      const res = await fetch("/api/admin/questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedLiveIds, patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Bulk update failed");
      await loadLiveQuestions(goldenTracking?.setId);
      await loadGoldenTracking(selectedBlockId).catch(() => null);
      setMessage(`Updated ${data.updated || selectedLiveIds.length} live question(s).`);
    } catch (e: any) {
      setMessage(e?.message || "Bulk update failed");
    } finally {
      setSavingId("");
    }
  }

  function toggleLiveSelection(id: string, checked: boolean) {
    setSelectedLiveIds((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id));
  }

  function toggleAllFilteredLive(checked: boolean) {
    if (checked) {
      setSelectedLiveIds((current) => [...new Set([...current, ...asArray(filteredLiveQuestions).map((q) => q.id)])]);
    } else {
      const visible = new Set(asArray(filteredLiveQuestions).map((q) => q.id));
      setSelectedLiveIds((current) => current.filter((id) => !visible.has(id)));
    }
  }

  if (!authChecked) {
    return (
      <div className="page">
        <div className="container">
          <div className="card">Checking admin access…</div>
        </div>
      </div>
    );
  }

  return (
    <main style={{ padding: 16, maxWidth: 1440, margin: "0 auto" }}>
      <style>{`
        .content-grid { display:grid; grid-template-columns: minmax(260px, 320px) minmax(0, 1fr); gap:16px; align-items:start; }
        .content-actions { display:flex; gap:8px; flex-wrap:wrap; }
        .toggle { display:inline-flex; align-items:center; gap:10px; cursor:pointer; user-select:none; }
        .toggle input { display:none; }
        .toggle .rail { width:52px; height:30px; border-radius:999px; background:rgba(255,255,255,0.14); border:1px solid rgba(255,255,255,0.12); position:relative; transition:all .18s ease; }
        .toggle .thumb { width:24px; height:24px; border-radius:999px; background:white; position:absolute; top:2px; left:2px; transition:all .18s ease; box-shadow:0 4px 18px rgba(0,0,0,0.28); }
        .toggle input:checked + .rail { background:linear-gradient(135deg, rgba(250,204,21,.42), rgba(99,102,241,.55)); border-color:rgba(250,204,21,.45); }
        .toggle input:checked + .rail .thumb { left:24px; }
        .toggle .label { font-size:12px; opacity:.85; font-weight:700; }
        .mini-btn { padding:8px 10px; border-radius:10px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:inherit; }
        .mini-btn.active { background:rgba(99,102,241,0.18); border-color:rgba(99,102,241,0.4); }
        .live-grid { display:grid; gap:12px; }
        @media (max-width: 900px) {
          .content-grid { grid-template-columns: 1fr; }
          .content-sidebar { position: static !important; max-height: none !important; }
        }
      `}</style>
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 28 }}>Admin Content Studio</div>
            <div style={{ opacity: 0.85, marginTop: 6 }}>Upload fact banks, generate mixed question types, approve them fast, then manage live Test Now and training sets with better golden eligibility controls.</div>
          </div>
          <div className="content-actions">
            <button onClick={() => (window.location.href = "/admin")}>Back to admin</button>
            <button onClick={() => setTab("import")} className={tab === "import" ? "primaryBtn" : "secondaryBtn" as any}>Import</button>
            <button onClick={() => setTab("review")} className={tab === "review" ? "primaryBtn" : "secondaryBtn" as any}>Review & Publish</button>
          </div>
        </div>
        {message ? <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.28)" }}>{message}</div> : null}
      </div>

      <div className="content-grid" style={{ marginTop: 16 }}>
        <aside className="card content-sidebar" style={{ padding: 14, position: "sticky", top: 18 }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Knowledge blocks</div>
          <div style={{ display: "grid", gap: 8, maxHeight: "70vh", overflow: "auto" }}>
            {asArray(blocks).map((block) => (
              <button
                key={block.id}
                onClick={() => setSelectedBlockId(block.id)}
                style={{
                  textAlign: "left",
                  padding: 10,
                  borderRadius: 12,
                  border: selectedBlockId === block.id ? "1px solid rgba(99,102,241,0.55)" : "1px solid rgba(255,255,255,0.12)",
                  background: selectedBlockId === block.id ? "rgba(99,102,241,0.16)" : "rgba(255,255,255,0.04)",
                  color: "inherit",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 700 }}>{block.title}</div>
                <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>{block.lane} • diff {block.difficulty} • stage {block.stage}</div>
                <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>{block.status} • generated {block._count?.generatedQuestions ?? 0}</div>
              </button>
            ))}
            {!blocks.length ? <div style={{ opacity: 0.75 }}>No knowledge blocks yet.</div> : null}
          </div>
        </aside>

        <section style={{ display: "grid", gap: 16 }}>
          {tab === "import" ? (
            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 20 }}>Import knowledge blocks</div>
                  <div style={{ opacity: 0.8, marginTop: 4 }}>Paste JSON blocks here or load a .json file. Use sync when you want the whole pipeline to import, generate, approve, and publish into the correct live set in one pass.</div>
                </div>
                <div className="content-actions">
                  <button onClick={() => setRawJson(SAMPLE_BLOCK)}>Load sample</button>
                  <button onClick={() => importRef.current?.click()}>Load .json file</button>
                  <button onClick={importBlocks} className="primaryBtn" disabled={loading || syncing}>{loading ? "Saving..." : "Save blocks"}</button>
                  <button onClick={syncFactBankToLive} className="secondaryBtn" disabled={loading || syncing}>{syncing ? "Syncing..." : "Sync fact bank to live DB"}</button>
                </div>
              </div>
              <input
                ref={importRef}
                type="file"
                accept="application/json,.json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importFile(file);
                  e.currentTarget.value = "";
                }}
              />
              <textarea value={rawJson} onChange={(e) => setRawJson(e.target.value)} style={{ width: "100%", minHeight: 420, marginTop: 14, borderRadius: 12, padding: 14, background: "rgba(0,0,0,0.28)", color: "inherit", border: "1px solid rgba(255,255,255,0.12)", fontFamily: "monospace", fontSize: 13 }} />
              {selectedBlock ? (
                <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={generateForSelected} className="primaryBtn" disabled={loading || syncing}>Generate questions for selected block</button>
                  <span className="badge">Selected: {selectedBlock.title}</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 20 }}>Review generated questions</div>
                  <div style={{ opacity: 0.8, marginTop: 4 }}>{selectedBlock ? `${selectedBlock.title} • ${questions.length} generated question(s)` : "Select a block to review"}</div>
                </div>
                <div className="content-actions">
                  <button onClick={generateForSelected} disabled={!selectedBlockId || loading || syncing}>Regenerate</button>
                  <button onClick={publishSelected} className="primaryBtn" disabled={!selectedBlockId || loading || syncing}>Publish approved questions</button>
                </div>
              </div>

              {selectedBlock ? (
                <div className="card" style={{ padding: 14, marginTop: 14, background: "rgba(255,215,0,0.06)", border: "1px solid rgba(255,215,0,0.24)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 18 }}>Golden question tracking</div>
                      <div style={{ opacity: 0.78, marginTop: 4 }}>Golden status is runtime-only in Test Now. This panel tracks which live questions are eligible and how often they actually spawned.</div>
                    </div>
                    <div className="content-actions">
                      <button className={reviewPanel === "generated" ? "mini-btn active" : "mini-btn"} onClick={() => setReviewPanel("generated")}>Generated queue</button>
                      <button className={reviewPanel === "live" ? "mini-btn active" : "mini-btn"} onClick={() => setReviewPanel("live")}>Live set manager</button>
                    </div>
                  </div>
                  {goldenTracking ? (
                    <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span className="badge">lane {goldenTracking.lane}</span>
                        <span className="badge">live {goldenTracking.totalLiveQuestions}</span>
                        <span className="badge">test-now eligible {goldenTracking.testNowEligibleCount}</span>
                        <span className="badge">golden eligible {goldenTracking.goldenEligibleCount}</span>
                        <span className="badge">golden spawns {goldenTracking.totalGoldenSpawns}</span>
                        <span className="badge">golden correct {goldenTracking.correctGoldenAnswers}</span>
                        <span className="badge">golden missed {goldenTracking.missedGoldenAnswers}</span>
                      </div>
                      <div style={{ display: "grid", gap: 10 }}>
                        <div style={{ fontWeight: 700 }}>Recent golden spawns</div>
                        {asArray(goldenTracking.recentGoldenSpawns).length ? asArray(goldenTracking.recentGoldenSpawns).slice(0, 6).map((row) => (
                          <div key={row.sessionQuestionId} style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}>
                            <div style={{ fontWeight: 700 }}>Session {row.session.id} • user {row.session.userId}</div>
                            <div style={{ fontSize: 12, opacity: 0.78, marginTop: 4 }}>Spawned {new Date(row.createdAt).toLocaleString()} • status {row.session.status} • answered {row.answered ? "yes" : "no"} • correct {row.isCorrect === null ? "—" : row.isCorrect ? "yes" : "no"} • bonus {row.goldenBonusXp || 0} XP</div>
                          </div>
                        )) : <div style={{ opacity: 0.72 }}>No golden spawn history yet for this block.</div>}
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 12, opacity: 0.72 }}>No published live set found for this block yet.</div>
                  )}
                </div>
              ) : null}

              {reviewPanel === "generated" ? (
                <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
                  {asArray(questions).map((question) => (
                    <GeneratedQuestionCard key={question.id} question={question} saving={savingId === question.id} onSave={updateQuestion} />
                  ))}
                  {!questions.length ? <div style={{ opacity: 0.75 }}>No generated questions for this block yet.</div> : null}
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
                  <div className="card" style={{ padding: 14, background: "rgba(255,255,255,0.03)" }}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <input value={liveSearch} onChange={(e) => setLiveSearch(e.target.value)} placeholder="Search live prompts or tags" style={{ ...fieldStyle, minHeight: 42, width: 280 }} />
                        <button className={liveFilter === "all" ? "mini-btn active" : "mini-btn"} onClick={() => setLiveFilter("all")}>All</button>
                        <button className={liveFilter === "test-now" ? "mini-btn active" : "mini-btn"} onClick={() => setLiveFilter("test-now")}>Test Now</button>
                        <button className={liveFilter === "golden" ? "mini-btn active" : "mini-btn"} onClick={() => setLiveFilter("golden")}>Golden</button>
                      </div>
                      <div style={{ opacity: 0.8, fontSize: 13 }}>{filteredLiveQuestions.length} visible • {selectedLiveIds.length} selected</div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
                      <label className="toggle">
                        <input type="checkbox" checked={allFilteredLiveSelected} onChange={(e) => toggleAllFilteredLive(e.target.checked)} />
                        <span className="rail"><span className="thumb" /></span>
                        <span className="label">Select visible</span>
                      </label>
                      <button className="mini-btn" disabled={!selectedLiveIds.length || savingId === "bulk-live"} onClick={() => bulkUpdateLiveQuestions({ testNowEligible: true })}>Enable Test Now</button>
                      <button className="mini-btn" disabled={!selectedLiveIds.length || savingId === "bulk-live"} onClick={() => bulkUpdateLiveQuestions({ testNowEligible: false, isGoldenEligible: false })}>Remove from Test Now</button>
                      <button className="mini-btn" disabled={!selectedLiveIds.length || savingId === "bulk-live"} onClick={() => bulkUpdateLiveQuestions({ isGoldenEligible: true, testNowEligible: true, goldenWeight: bulkWeight, goldenBonusXp: bulkBonusXp })}>Mark golden eligible</button>
                      <button className="mini-btn" disabled={!selectedLiveIds.length || savingId === "bulk-live"} onClick={() => bulkUpdateLiveQuestions({ isGoldenEligible: false })}>Clear golden</button>
                      <input type="number" min={1} max={10} value={bulkWeight} onChange={(e) => setBulkWeight(Number(e.target.value) || 1)} style={{ ...fieldStyle, minHeight: 40, width: 90 }} />
                      <input type="number" min={0} step={5} value={bulkBonusXp} onChange={(e) => setBulkBonusXp(Number(e.target.value) || 0)} style={{ ...fieldStyle, minHeight: 40, width: 110 }} />
                    </div>
                  </div>

                  <div className="live-grid">
                    {asArray(filteredLiveQuestions).map((question) => (
                      <LiveQuestionCard
                        key={question.id}
                        question={question}
                        saving={savingId === question.id}
                        selected={selectedLiveIds.includes(question.id)}
                        onSelect={toggleLiveSelection}
                        onSave={updateLiveQuestion}
                      />
                    ))}
                    {!filteredLiveQuestions.length ? <div style={{ opacity: 0.75 }}>No live questions matched this filter.</div> : null}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function GeneratedQuestionCard({ question, saving, onSave }: { question: GeneratedQuestion; saving: boolean; onSave: (q: GeneratedQuestion, patch: Partial<GeneratedQuestion>) => Promise<void> }) {
  const [prompt, setPrompt] = useState(question.prompt);
  const [explanation, setExplanation] = useState(question.explanation || "");
  const [reviewStatus, setReviewStatus] = useState(question.reviewStatus);
  const [dataText, setDataText] = useState(JSON.stringify(question.data || {}, null, 2));
  const [choicesText, setChoicesText] = useState(Array.isArray(question.choices) ? question.choices.join("\n") : "");
  const [editorNotes, setEditorNotes] = useState(question.editorNotes || "");

  useEffect(() => {
    setPrompt(question.prompt);
    setExplanation(question.explanation || "");
    setReviewStatus(question.reviewStatus);
    setDataText(JSON.stringify(question.data || {}, null, 2));
    setChoicesText(Array.isArray(question.choices) ? question.choices.join("\n") : "");
    setEditorNotes(question.editorNotes || "");
  }, [question]);

  async function save() {
    const patch: Partial<GeneratedQuestion> = {
      prompt,
      explanation,
      reviewStatus,
      editorNotes,
      data: JSON.parse(dataText),
      choices: choicesText.trim() ? choicesText.split("\n").map((v) => v.trim()).filter(Boolean) : null,
    };
    await onSave(question, patch);
  }

  return (
    <div className="card" style={{ padding: 14, background: "rgba(255,255,255,0.03)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontWeight: 800 }}>{question.type.replaceAll("_", " ")}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="badge">diff {question.difficulty}</span>
          <select value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value)}>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="EDITED">Edited</option>
          </select>
          <button onClick={save} className="primaryBtn" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <small>Prompt</small>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} style={fieldStyle} />
        </label>
        {question.type === "MULTIPLE_CHOICE" || question.type === "INCIDENT" ? (
          <label style={{ display: "grid", gap: 6 }}>
            <small>Choices (one per line)</small>
            <textarea value={choicesText} onChange={(e) => setChoicesText(e.target.value)} style={fieldStyle} />
          </label>
        ) : null}
        <label style={{ display: "grid", gap: 6 }}>
          <small>Data JSON</small>
          <textarea value={dataText} onChange={(e) => setDataText(e.target.value)} style={{ ...fieldStyle, minHeight: 160, fontFamily: "monospace", fontSize: 12 }} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <small>Explanation</small>
          <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} style={fieldStyle} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <small>Editor notes</small>
          <textarea value={editorNotes} onChange={(e) => setEditorNotes(e.target.value)} style={fieldStyle} />
        </label>
      </div>
    </div>
  );
}

function LiveQuestionCard({ question, saving, selected, onSelect, onSave }: { question: LiveQuestion; saving: boolean; selected: boolean; onSelect: (id: string, checked: boolean) => void; onSave: (id: string, patch: Partial<LiveQuestion>) => Promise<void> }) {
  const [localWeight, setLocalWeight] = useState(question.goldenWeight);
  const [localBonus, setLocalBonus] = useState(question.goldenBonusXp);

  useEffect(() => {
    setLocalWeight(question.goldenWeight);
    setLocalBonus(question.goldenBonusXp);
  }, [question.goldenWeight, question.goldenBonusXp]);

  return (
    <div className="card" style={{ padding: 14, background: selected ? "rgba(99,102,241,0.09)" : "rgba(255,255,255,0.03)", border: selected ? "1px solid rgba(99,102,241,0.35)" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input type="checkbox" checked={selected} onChange={(e) => onSelect(question.id, e.target.checked)} />
          <div style={{ fontWeight: 800 }}>{question.prompt}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="badge">{question.type.replaceAll("_", " ")}</span>
          <span className="badge">diff {question.difficulty}</span>
          <span className="badge">#{question.sortOrder}</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
        <ToggleSwitch label="Test Now" checked={question.testNowEligible} onChange={(checked) => onSave(question.id, { testNowEligible: checked, isGoldenEligible: checked ? question.isGoldenEligible : false })} disabled={saving} />
        <ToggleSwitch label="Golden eligible" checked={question.isGoldenEligible} onChange={(checked) => onSave(question.id, { isGoldenEligible: checked, testNowEligible: checked ? true : question.testNowEligible })} disabled={saving || !question.testNowEligible} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, opacity: 0.8 }}>Weight</span>
          <input type="number" min={1} max={10} value={localWeight} onChange={(e) => setLocalWeight(Number(e.target.value) || 1)} style={{ ...fieldStyle, minHeight: 40, width: 84 }} />
          <button className="mini-btn" disabled={saving} onClick={() => onSave(question.id, { goldenWeight: localWeight })}>Save</button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, opacity: 0.8 }}>Bonus XP</span>
          <input type="number" min={0} step={5} value={localBonus} onChange={(e) => setLocalBonus(Number(e.target.value) || 0)} style={{ ...fieldStyle, minHeight: 40, width: 96 }} />
          <button className="mini-btn" disabled={saving} onClick={() => onSave(question.id, { goldenBonusXp: localBonus })}>Save</button>
        </div>
      </div>

      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 10 }}>
        tags: {(question.tags || []).join(", ") || "—"}
      </div>
    </div>
  );
}

function ToggleSwitch({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <label className="toggle" style={{ opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? "none" : "auto" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="rail"><span className="thumb" /></span>
      <span className="label">{label}</span>
    </label>
  );
}

const fieldStyle: CSSProperties = {
  width: "100%",
  minHeight: 74,
  borderRadius: 10,
  padding: 10,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(0,0,0,0.24)",
  color: "inherit",
};
