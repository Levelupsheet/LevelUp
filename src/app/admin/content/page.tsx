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
      { "statement": "HTTPS uses port 443", "answer": "443", "distractors": ["80", "21", "53"] },
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
    "distractors": ["Restart the monitor", "Replace the mouse"]
  }
]`;

export default function AdminContentStudioPage() {
  const [tab, setTab] = useState<"import" | "review">("import");
  const [rawJson, setRawJson] = useState(SAMPLE_BLOCK);
  const [message, setMessage] = useState("");
  const [blocks, setBlocks] = useState<KnowledgeBlock[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string>("");
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [savingId, setSavingId] = useState<string>("");
  const importRef = useRef<HTMLInputElement | null>(null);

  const selectedBlock = useMemo(
    () => blocks.find((b) => b.id === selectedBlockId) || null,
    [blocks, selectedBlockId]
  );

  async function loadBlocks() {
    const res = await fetch("/api/admin/knowledge-blocks", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to load knowledge blocks");
    setBlocks(data.blocks || []);
    if (!selectedBlockId && data.blocks?.[0]?.id) setSelectedBlockId(data.blocks[0].id);
  }

  async function loadQuestions(blockId: string) {
    if (!blockId) {
      setQuestions([]);
      return;
    }
    const res = await fetch(`/api/admin/generated-questions?knowledgeBlockId=${encodeURIComponent(blockId)}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to load generated questions");
    setQuestions(data.questions || []);
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
    if (authChecked) {
      loadQuestions(selectedBlockId).catch((e) => setMessage(e.message));
    }
  }, [selectedBlockId, authChecked]);

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
      await loadQuestions(selectedBlockId);
      setTab("review");
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
      await loadQuestions(selectedBlockId);
    } catch (e: any) {
      setMessage(e?.message || "Publish failed");
    } finally {
      setLoading(false);
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
    <main style={{ padding: 16, maxWidth: 1400, margin: "0 auto" }}>
      <style>{`
        .content-grid { display:grid; grid-template-columns: minmax(260px, 320px) minmax(0, 1fr); gap:16px; align-items:start; }
        .content-actions { display:flex; gap:8px; flex-wrap:wrap; }
        @media (max-width: 900px) {
          .content-grid { grid-template-columns: 1fr; }
          .content-sidebar { position: static !important; max-height: none !important; }
        }
      `}</style>
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 28 }}>Admin Content Studio</div>
            <div style={{ opacity: 0.85, marginTop: 6 }}>Upload knowledge blocks, generate typed questions, review them, then publish to the live DB-backed question bank.</div>
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
            {blocks.map((block) => (
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
                  <div style={{ opacity: 0.8, marginTop: 4 }}>Paste JSON blocks here or load a .json file. Each block can include facts, definitions, procedures, commands, scenarios, and distractors.</div>
                </div>
                <div className="content-actions">
                  <button onClick={() => setRawJson(SAMPLE_BLOCK)}>Load sample</button>
                  <button onClick={() => importRef.current?.click()}>Load .json file</button>
                  <button onClick={importBlocks} className="primaryBtn" disabled={loading}>{loading ? "Saving..." : "Save blocks"}</button>
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
                  <button onClick={generateForSelected} className="primaryBtn" disabled={loading}>Generate questions for selected block</button>
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
                  <button onClick={generateForSelected} disabled={!selectedBlockId || loading}>Regenerate</button>
                  <button onClick={publishSelected} className="primaryBtn" disabled={!selectedBlockId || loading}>Publish approved questions</button>
                </div>
              </div>
              <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
                {questions.map((question) => (
                  <GeneratedQuestionCard key={question.id} question={question} saving={savingId === question.id} onSave={updateQuestion} />
                ))}
                {!questions.length ? <div style={{ opacity: 0.75 }}>No generated questions for this block yet.</div> : null}
              </div>
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
  const [choicesText, setChoicesText] = useState(Array.isArray(question.choices) ? question.choices.join("
") : "");
  const [editorNotes, setEditorNotes] = useState(question.editorNotes || "");

  useEffect(() => {
    setPrompt(question.prompt);
    setExplanation(question.explanation || "");
    setReviewStatus(question.reviewStatus);
    setDataText(JSON.stringify(question.data || {}, null, 2));
    setChoicesText(Array.isArray(question.choices) ? question.choices.join("
") : "");
    setEditorNotes(question.editorNotes || "");
  }, [question]);

  async function save() {
    const patch: Partial<GeneratedQuestion> = {
      prompt,
      explanation,
      reviewStatus,
      editorNotes,
      data: JSON.parse(dataText),
      choices: choicesText.trim() ? choicesText.split("
").map((v) => v.trim()).filter(Boolean) : null,
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

const fieldStyle: CSSProperties = {
  width: "100%",
  minHeight: 74,
  borderRadius: 10,
  padding: 10,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(0,0,0,0.24)",
  color: "inherit",
};
