"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  TEST_NOW_POOL_KEY,
  getAllDefaultPools,
  getPool,
  getPoolKeyForCert,
  getPoolKeyForPosition,
  listPoolKeys,
  type CertTrack,
  type PositionPath,
  type PracticeQuestion,
} from "@/lib/practicePools";
import {
  listLocalUsers,
  getActiveUser,
  createUser,
  setActiveUserId,
  updateUserById,
  deleteUserById,
  type LocalUser,
} from "@/lib/userStore";

const PIN = "13371337"; // TODO: move server-side later

type QuestionSet = { id: string; domain: string; name: string; status: string; createdAt: string; _count?: { questions?: number; placements?: number } };
type Question = {
  id: string;
  setId: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation?: string | null;
  difficulty: number;
  tags?: string[];
  sortOrder?: number;
  createdAt: string;
};
type AdminUser = {
  id: string;
  email: string;
  displayName?: string | null;
  xp: number;
  startingPosition?: string | null;
  moduleChoice?: string | null;
  createdAt: string;
  lastActiveAt?: string | null;
};

function LocalPrototypeAdmin(){
  const [users, setUsers] = useState(() => {
    try { return listLocalUsers(); } catch { return []; }
  });
  const active = useMemo(() => {
    try { return getActiveUser(); } catch { return null; }
  }, [users.length]);

  const poolMeta = useMemo(() => {
    const paths: PositionPath[] = ["HELPDESK_SUPPORT", "DESKTOP_TECHNICIAN", "CLOUD_ENGINEER"];
    const certs: CertTrack[] = ["A_PLUS", "SECURITY_PLUS", "AZ_900"];
    const entries: { key: string; label: string }[] = [];
    for (const p of paths) entries.push({ key: getPoolKeyForPosition(p), label: `Position • ${p}` });
    for (const c of certs) entries.push({ key: getPoolKeyForCert(c), label: `Cert • ${c}` });
    entries.push({ key: TEST_NOW_POOL_KEY, label: "Test Now • MIXED" });
    return entries;
  }, []);

  const [poolKey, setPoolKey] = useState(poolMeta[0]?.key ?? TEST_NOW_POOL_KEY);
  const [editor, setEditor] = useState<string>("[]");
  const [savedMsg, setSavedMsg] = useState<string>("");
  const importRef = useRef<HTMLInputElement | null>(null);

  // Local user editing
  const [selectedUserId, setSelectedUserId] = useState<string>("demo-user");
  const selectedUser = useMemo(() => users.find((u) => u.id === selectedUserId) ?? users[0] ?? null, [users, selectedUserId]);
  const [userDraft, setUserDraft] = useState<Partial<LocalUser>>({});
  const [newUserName, setNewUserName] = useState<string>("");
  const [newUserEmail, setNewUserEmail] = useState<string>("");
  const [userMsg, setUserMsg] = useState<string>("");

  function loadPool(key: string){
    setSavedMsg("");
    try {
      const raw = localStorage.getItem(key);
      if (raw) { setEditor(raw); return; }
    } catch {}
    // no override -> load default (current computed)
    const d = getAllDefaultPools();
    let pool: PracticeQuestion[] = [];
    if (key.includes("lu_pool_position")){
      const p = key.split("lu_pool_position_")[1] as PositionPath;
      pool = (d.position as any)[p] ?? [];
    } else if (key.includes("lu_pool_cert")){
      const c = key.split("lu_pool_cert_")[1] as CertTrack;
      pool = (d.cert as any)[c] ?? [];
    } else {
      pool = d.testNow;
    }
    setEditor(JSON.stringify(pool, null, 2));
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    loadPool(poolKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolKey]);

  function save(){
    setSavedMsg("");
    try {
      const parsed = JSON.parse(editor);
      if (!Array.isArray(parsed)) throw new Error("Pool JSON must be an array");
      localStorage.setItem(poolKey, JSON.stringify(parsed));
      setSavedMsg("Saved! (localStorage override applied)");
    } catch (e: any) {
      setSavedMsg(`Could not save: ${e?.message ?? "invalid JSON"}`);
    }
  }

  function reset(){
    setSavedMsg("");
    try { localStorage.removeItem(poolKey); } catch {}
    loadPool(poolKey);
    setSavedMsg("Reset to default.");
  }

  function onImportFile(file: File) {
    setSavedMsg("");
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error("Imported JSON must be an array");
        setEditor(JSON.stringify(parsed, null, 2));
        setSavedMsg("Imported into editor (not saved yet). Click Save override to apply.");
      } catch (e: any) {
        setSavedMsg(`Could not import: ${e?.message ?? "invalid JSON"}`);
      }
    };
    reader.readAsText(file);
  }

  function refreshLocal(){
    try { setUsers(listLocalUsers()); } catch { setUsers([]); }
  }

  useEffect(() => {
    setUserDraft({});
    setUserMsg("");
  }, [selectedUserId]);

  function saveUser(){
    setUserMsg("");
    if (!selectedUser) return;
    try {
      const patch: any = { ...userDraft };
      if (typeof patch.xp === "string") patch.xp = parseInt(patch.xp, 10);
      const next = updateUserById(selectedUser.id, patch);
      refreshLocal();
      setUserDraft({});
      setUserMsg(next ? "Saved user." : "Could not save user.");
    } catch (e: any) {
      setUserMsg(`Could not save: ${e?.message ?? "error"}`);
    }
  }

  function activateUser(){
    if (!selectedUser) return;
    setActiveUserId(selectedUser.id);
    refreshLocal();
    setUserMsg("Set as active user.");
  }

  function removeUser(){
    if (!selectedUser) return;
    if (selectedUser.id === "demo-user") {
      setUserMsg("Demo user cannot be deleted.");
      return;
    }
    deleteUserById(selectedUser.id);
    setSelectedUserId("demo-user");
    refreshLocal();
    setUserMsg("Deleted user.");
  }

  function addUser(){
    setUserMsg("");
    try {
      const u = createUser({ displayName: newUserName || "Student", email: newUserEmail || undefined });
      setNewUserName("");
      setNewUserEmail("");
      refreshLocal();
      setSelectedUserId(u.id);
      setUserMsg("Created user.");
    } catch (e: any) {
      setUserMsg(`Could not create: ${e?.message ?? "error"}`);
    }
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: 20 }}>Local prototype admin</div>
          <small>Manage local profiles + question pools (stored in the browser). This is what your Google-login backend will replace later.</small>
        </div>
        <button onClick={refreshLocal}>Refresh</button>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginTop: 12 }}>
        <div className="card" style={{ padding: 12, background:"rgba(255,255,255,0.03)" }}>
          <b>Local users</b>
          <div style={{ marginTop: 8, opacity: 0.9 }}>
            Active: <span className="badge">{active?.id ?? "(none)"}</span> <span className="badge">XP {active?.xp ?? 0}</span> <span className="badge">Lvl {(active as any)?.level ?? 1}</span>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr", gap: 10, marginTop: 12 }}>
            <div className="card" style={{ padding: 10, background:"rgba(255,255,255,0.02)" }}>
              <div style={{ display:"flex", gap: 10, flexWrap:"wrap", alignItems:"center" }}>
                <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} style={{ minWidth: 260 }}>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.email ? `${u.displayName} • ${u.email}` : u.displayName}</option>
                  ))}
                </select>
                <button onClick={activateUser}>Set active</button>
                <button onClick={saveUser} className="primary">Save user</button>
                <button onClick={removeUser} style={{ background:"rgba(239,68,68,0.14)", borderColor:"rgba(239,68,68,0.35)" }}>Delete</button>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(320px, 1fr))", gap: 10, marginTop: 10 }}>
                <label style={{ display:"grid", gap: 6 }}>
                  <small>Display name</small>
                  <input
                    value={(userDraft.displayName ?? selectedUser?.displayName ?? "") as any}
                    onChange={(e) => setUserDraft((d) => ({ ...d, displayName: e.target.value }))}
                    placeholder="Display name"
                  />
                </label>
                <label style={{ display:"grid", gap: 6 }}>
                  <small>Email (for future Google auth mapping)</small>
                  <input
                    value={(userDraft.email ?? selectedUser?.email ?? "") as any}
                    onChange={(e) => setUserDraft((d) => ({ ...d, email: e.target.value }))}
                    placeholder="user@email.com"
                  />
                </label>
                <label style={{ display:"grid", gap: 6 }}>
                  <small>XP (auto recalculates level)</small>
                  <input
                    value={(userDraft.xp ?? selectedUser?.xp ?? 0) as any}
                    onChange={(e) => setUserDraft((d) => ({ ...d, xp: Number(e.target.value) }))}
                    type="number"
                    min={0}
                  />
                </label>
                <div style={{ display:"grid", gap: 6 }}>
                  <small>Computed level</small>
                  <div className="badge" style={{ width:"fit-content" }}>Lvl {(selectedUser as any)?.level ?? 1}</div>
                </div>
              </div>

              <div style={{ marginTop: 10, display:"grid", gap: 8 }}>
                <small style={{ opacity: 0.8 }}>Track progress (0–100)</small>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
                  {(["azure_m365","aws","helpdesk","desktop"] as any[]).map((t) => (
                    <label key={t} style={{ display:"grid", gap: 6 }}>
                      <small>{t}</small>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setUserDraft((d) => {
                            const existing = (d.trackProgress ?? selectedUser?.trackProgress) as Record<string, number> | undefined;
                            const base = {
                              azure_m365: existing?.azure_m365 ?? 0,
                              aws: existing?.aws ?? 0,
                              helpdesk: existing?.helpdesk ?? 0,
                              desktop: existing?.desktop ?? 0,
                            };
                            return {
                              ...d,
                              trackProgress: { ...base, [t]: val },
                            };
                          });
                        }}
                      />
                    </label>
                  ))}
                </div>
              </div>
              {userMsg ? <div style={{ marginTop: 10 }}><small style={{ opacity: 0.9 }}>{userMsg}</small></div> : null}
            </div>

            <div className="card" style={{ padding: 10, background:"rgba(255,255,255,0.02)" }}>
              <b>Create new user (local)</b>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 10, alignItems:"end" }}>
                <label style={{ display:"grid", gap: 6 }}>
                  <small>Name</small>
                  <input value={newUserName} onChange={(e) => setNewUserName(e.target.value)} placeholder="Tyrone" />
                </label>
                <label style={{ display:"grid", gap: 6 }}>
                  <small>Email (optional)</small>
                  <input value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} placeholder="you@email.com" />
                </label>
                <button onClick={addUser} className="primary">Create</button>
              </div>
              <small style={{ opacity: 0.75 }}>Tip: When you add Google auth later, you can map the Google email to these local profiles.
              </small>
            </div>
          </div>

          <div style={{ marginTop: 10, maxHeight: 220, overflow:"auto" }}>
            <table className="luTable">
              <thead>
                <tr><th>User ID</th><th>Display</th><th>Email</th><th>XP</th><th>Level</th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td><small>{u.id}</small></td>
                    <td>{u.displayName}</td>
                    <td><small>{u.email ?? ""}</small></td>
                    <td>{u.xp ?? 0}</td>
                    <td>{(u as any).level ?? 1}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ padding: 12, background:"rgba(255,255,255,0.03)" }}>
          <b>Question pools</b>
          <div style={{ display:"flex", gap: 10, alignItems:"center", marginTop: 10, flexWrap:"wrap" }}>
            <select value={poolKey} onChange={(e) => setPoolKey(e.target.value)} style={{ minWidth: 320 }}>
              {poolMeta.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
            <button onClick={save} className="primary">Save override</button>
            <button onClick={reset}>Reset</button>
            <button onClick={() => importRef.current?.click()}>Import .json</button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportFile(f);
                e.currentTarget.value = "";
              }}
            />
          </div>
          {savedMsg ? <div style={{ marginTop: 8 }}><small style={{ opacity: 0.9 }}>{savedMsg}</small></div> : null}
          <textarea
            value={editor}
            onChange={(e) => setEditor(e.target.value)}
            style={{ width:"100%", minHeight: 260, marginTop: 10, fontFamily:"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 12 }}
          />
          <small style={{ opacity: 0.75 }}>Tip: Each item should include id, prompt, choices, correctIndex, and explanation.</small>
        </div>
      </div>
    </div>
  );
}

function PracticePoolsAdmin(){
  const [poolKey, setPoolKey] = useState<string>("POSITION:HELPDESK_SUPPORT");
  const [filter, setFilter] = useState<string>("");
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<PracticeQuestion | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);

  const allPools = useMemo(() => {
    const keys = listPoolKeys();
    return keys;
  }, []);

  const pool = useMemo(() => {
    const merged = getPool(poolKey);
    return merged ?? [];
  }, [poolKey]);

  const storageKey = useMemo(() => {
    const [lane, track] = poolKey.split(":");
    if (lane === "POSITION") return getPoolKeyForPosition(track as PositionPath);
    if (lane === "CERT") return getPoolKeyForCert(track as CertTrack);
    if (lane === "TEST_NOW") return TEST_NOW_POOL_KEY;
    return "";
  }, [poolKey]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter((x) =>
      (x.prompt || "").toLowerCase().includes(q) || (x.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }, [pool, filter]);

  function openEdit(q: PracticeQuestion){
    setEditing(q);
    setDraft(JSON.stringify(q, null, 2));
    setEditOpen(true);
    setMsg(null);
  }

  function saveEdited(){
    if (!editing) return;
    const parsed = safeJsonParse<any>(draft, null);
    if (!parsed || !parsed.prompt || !Array.isArray(parsed.choices) || typeof parsed.correctIndex !== "number") {
      setMsg("Invalid JSON. Must include prompt, choices[], correctIndex.");
      return;
    }
    const [lane, track] = poolKey.split(":");
    parsed.lane = lane;
    parsed.track = track;

    const updated = pool.map((x) => (x.id === editing.id ? { ...x, ...parsed, id: editing.id } : x));
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
      setMsg("Saved override (localStorage)." );
      setEditOpen(false);
      setEditing(null);
    } catch {
      setMsg("Failed to save override.");
    }
  }

  function exportJson(download: boolean){
    const payload = JSON.stringify(pool, null, 2);
    if (!download) {
      navigator.clipboard?.writeText(payload);
      setMsg("Copied pool JSON to clipboard.");
      return;
    }
    const blob = new Blob([payload], { type: "application/json" });
    const a = document.createElement("a");
    const safeName = poolKey.toLowerCase().replace(/[^a-z0-9_\-:]/g, "_").replace(/[:]/g, "-");
    a.href = URL.createObjectURL(blob);
    a.download = `levelup-${safeName}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setMsg("Downloaded pool JSON.");
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 20 }}>Practice question pools</div>
          <small>These are the live pools used by Mock Interview + the Start Now mini-games.</small>
        </div>
        <button onClick={() => location.reload()}>Refresh</button>
      </div>

      <div style={{ marginTop: 12, display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        <div className="card" style={{ background:"rgba(255,255,255,0.03)" }}>
          <label><small>Pool</small></label>
          <select value={poolKey} onChange={(e) => setPoolKey(e.target.value)}>
            {allPools.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <div className="row" style={{ marginTop: 10 }}>
            <span className="badge">Questions: {pool.length}</span>
            <span className="badge">Visible: {visible.length}</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <label><small>Search</small></label>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="prompt or tag…" />
          </div>
          <div style={{ marginTop: 10 }}>
            <small className="muted">Admin roadmap: import/export + inline edits once Google auth is wired in.</small>
          </div>
        </div>

        <div className="card" style={{ background:"rgba(255,255,255,0.03)" }}>
          <div style={{ fontWeight: 800 }}>Questions</div>
          <small>{poolKey}</small>
          <div className="row" style={{ marginTop: 10, justifyContent: "space-between" }}>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <span className="badge">Storage: {storageKey || "(none)"}</span>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="secondaryBtn" onClick={() => exportJson(false)}>Copy JSON</button>
              <button className="secondaryBtn" onClick={() => exportJson(true)}>Download</button>
            </div>
          </div>
          <div style={{ marginTop: 12, maxHeight: 520, overflow:"auto", display:"grid", gap: 10 }}>
            {visible.map((q, idx) => (
              <div key={q.id} className="card" style={{ background:"rgba(0,0,0,0.25)" }}>
                <div style={{ display:"flex", alignItems:"start", justifyContent:"space-between", gap: 12 }}>
                  <div style={{ fontWeight: 800, flex: 1 }}>{idx + 1}. {q.prompt}</div>
                  <button className="secondaryBtn" onClick={() => openEdit(q)}>Edit</button>
                </div>
                <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
                  <span className="badge">Correct: {q.correctIndex + 1}</span>
                  {q.tags?.map((t) => <span className="badge" key={t}>#{t}</span>)}
                </div>
                <div style={{ marginTop: 10, display:"grid", gap: 6 }}>
                  {q.choices?.map((c, i) => (
                    <div key={i} style={{
                      padding: "8px 10px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: i === q.correctIndex ? "rgba(74, 222, 128, 0.12)" : "rgba(255,255,255,0.04)",
                    }}>
                      <small style={{ opacity: 0.92 }}><b>{i + 1}.</b> {c}</small>
                    </div>
                  ))}
                  <div style={{ marginTop: 6 }}>
                    <small style={{ opacity: 0.82 }}><b>Explanation:</b> {q.explanation}</small>
                  </div>
                </div>
              </div>
            ))}
            {visible.length === 0 ? (
              <div className="card" style={{ background:"rgba(0,0,0,0.25)" }}>
                <small>No matches.</small>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <Modal
        open={editOpen}
        title={`Edit question • ${poolKey}`}
        onClose={() => { setEditOpen(false); setEditing(null); setMsg(null); }}
      >
        <p style={{ marginTop: 0, opacity: 0.85 }}>
          Edit the JSON for this question, then save to localStorage override.
        </p>
        <textarea
          className="luTextarea"
          style={{ width: "100%", minHeight: 320, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        {msg ? <p style={{ marginTop: 10 }}><small>{msg}</small></p> : null}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <button className="secondaryBtn" onClick={() => setEditOpen(false)}>Cancel</button>
          <button className="primary" onClick={saveEdited}>Save</button>
        </div>
      </Modal>

      {msg ? <Toast msg={msg} /> : null}
    </div>
  );
}

function safeJsonParse<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function Modal({ open, title, onClose, children }:{
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}){
  if (!open) return null;
  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth: 860 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modalBody">{children}</div>
      </div>
    </div>
  );
}

function Toast({ msg }:{ msg: string }){
  return (
    <div style={{
      position:"fixed", right: 18, bottom: 18, zIndex: 60,
      background:"rgba(0,0,0,0.65)", border:"1px solid rgba(255,255,255,0.18)",
      borderRadius: 14, padding:"10px 12px", backdropFilter:"blur(10px)"
    }}>
      <small style={{ color: "rgba(231,238,252,0.9)" }}>{msg}</small>
    </div>
  );
}

export default function AdminPage(){
  const [ok, setOk] = useState(false);
  const [pin, setPin] = useState("");
  const [tab, setTab] = useState<"questions" | "users" | "local">("questions");
  const [bulkImporting, setBulkImporting] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Users
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userEdits, setUserEdits] = useState<Record<string, Partial<AdminUser>>>({});

  // Question bank
  const [sets, setSets] = useState<QuestionSet[]>([]);
  const [assignMsg, setAssignMsg] = useState<string | null>(null);
  const [assignStartPos, setAssignStartPos] = useState<"HELPDESK_SUPPORT" | "DESKTOP_TECHNICIAN" | "CLOUD_ENGINEER">("HELPDESK_SUPPORT");
  const [assignCertExam, setAssignCertExam] = useState<"A_PLUS" | "SECURITY_PLUS" | "AZ_900">("A_PLUS");

  const [selectedSet, setSelectedSet] = useState<string>("");
  const [newSetName, setNewSetName] = useState("Networking Set 1");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [dirtyOrder, setDirtyOrder] = useState(false);

  const [qDraft, setQDraft] = useState(`{
  "prompt": "A user reports intermittent connectivity over Wi-Fi. Which step should you do FIRST?",
  "choices": ["Replace the laptop", "Check signal strength and interference", "Reimage the OS", "Disable the firewall"],
  "correctIndex": 1,
  "explanation": "Start with the least invasive troubleshooting: verify RSSI/interference before replacing hardware.",
  "difficulty": 1,
  "tags": ["Wi-Fi", "Troubleshooting"]
}`);

  const [previewQ, setPreviewQ] = useState<Question | null>(null);
  const [uploadPreview, setUploadPreview] = useState<any[] | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const bulkFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("lu_admin_ok");
    if (saved === "1") setOk(true);
  }, []);

  function popToast(msg: string){
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  function normalizeDomain(value: unknown): string {
    const raw = String(value || "GENERAL").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    const allowed = ["IDENTITY","NETWORKING","SECURITY","COMPUTE","STORAGE","AZURE","AWS","WINDOWS","GENERAL"];
    return allowed.includes(raw) ? raw : "GENERAL";
  }

  function inferPlacementMeta(q: any) {
    const tags = Array.isArray(q?.tags) ? q.tags.map((v: any) => String(v).toLowerCase()) : [];
    const text = [q?.track, q?.path, q?.startingPosition, q?.certExam, q?.exam, ...(Array.isArray(q?.tags) ? q.tags : [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const lane = text.includes("interview")
      ? "INTERVIEW"
      : (q?.certExam || q?.exam || tags.some((t: string) => ["a_plus", "security_plus", "az_900", "cert", "certification"].includes(t)))
        ? "CERTIFICATIONS"
        : (q?.startingPosition || q?.path || tags.some((t: string) => ["helpdesk", "desktop", "cloud", "training"].includes(t)))
          ? "TRAINING"
          : "TEST_NOW";

    let startingPosition = String(q?.startingPosition || q?.path || "").toUpperCase();
    if (!startingPosition) {
      if (text.includes("helpdesk")) startingPosition = "HELPDESK_SUPPORT";
      else if (text.includes("desktop")) startingPosition = "DESKTOP_TECHNICIAN";
      else if (text.includes("cloud")) startingPosition = "CLOUD_ENGINEER";
    }

    let certExam = String(q?.certExam || q?.exam || "").toUpperCase();
    if (!certExam) {
      if (text.includes("a+") || text.includes("a_plus")) certExam = "A_PLUS";
      else if (text.includes("security+") || text.includes("security_plus")) certExam = "SECURITY_PLUS";
      else if (text.includes("az-900") || text.includes("az_900")) certExam = "AZ_900";
    }

    return { lane, startingPosition, certExam, domain: normalizeDomain(q?.domain) };
  }

  async function createSetRecord(name: string, domain: string) {
    const r = await fetch("/api/admin/qsets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, name, status: "DRAFT" }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || `Failed to create set ${name}`);
    return j.set as QuestionSet;
  }

  async function bulkImportAndAssign(file: File) {
    setErr(null);
    setAssignMsg(null);
    setBulkImporting(true);
    try {
      const text = await file.text();
      const parsed = safeJsonParse<any>(text, null);
      const qList = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.questions) ? parsed.questions : null);
      if (!qList || !qList.length) throw new Error("JSON must be an array or { questions: [...] }");

      const groups = new Map<string, { setName: string; domain: string; lane: string; startingPosition?: string; certExam?: string; questions: any[] }>();
      for (const q of qList) {
        const meta = inferPlacementMeta(q);
        const key = [meta.lane, meta.startingPosition || "all", meta.certExam || "all", meta.domain].join("::");
        if (!groups.has(key)) {
          const label = [meta.lane.replaceAll("_", " "), meta.startingPosition?.replaceAll("_", " "), meta.certExam?.replaceAll("_", " "), meta.domain].filter(Boolean).join(" • ");
          groups.set(key, {
            setName: `Auto ${label}`,
            domain: meta.domain,
            lane: meta.lane,
            startingPosition: meta.startingPosition || undefined,
            certExam: meta.certExam || undefined,
            questions: [],
          });
        }
        groups.get(key)!.questions.push(q);
      }

      let createdCount = 0;
      let importedCount = 0;
      let assignedCount = 0;
      let firstSetId = "";
      for (const group of groups.values()) {
        const set = await createSetRecord(group.setName, group.domain);
        if (!firstSetId) firstSetId = set.id;
        createdCount += 1;

        const importRes = await fetch("/api/admin/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setId: set.id, questions: group.questions }),
        });
        const importJson = await importRes.json();
        if (!importRes.ok) throw new Error(importJson?.error || `Failed importing ${group.setName}`);
        importedCount += Number(importJson?.inserted || 0);

        if (group.lane !== "INTERVIEW") {
          const placeBody: any = { setId: set.id, lane: group.lane };
          if (group.lane === "TRAINING" && group.startingPosition) placeBody.startingPosition = group.startingPosition;
          if (group.lane === "CERTIFICATIONS" && group.certExam) placeBody.certExam = group.certExam;
          const placeRes = await fetch("/api/admin/placements", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(placeBody),
          });
          const placeJson = await placeRes.json();
          if (!placeRes.ok) throw new Error(placeJson?.error || `Failed assigning ${group.setName}`);
          assignedCount += 1;
        }
      }

      await refreshSets();
      if (firstSetId) {
        setSelectedSet(firstSetId);
        await refreshQuestions(firstSetId);
      }
      popToast("Bulk import complete");
      setAssignMsg(`Created ${createdCount} set(s), imported ${importedCount} question(s), assigned ${assignedCount} live placement(s). Interview-tagged questions were grouped into their own set.`);
    } catch (e: any) {
      setErr(e?.message || "Bulk import failed");
    } finally {
      setBulkImporting(false);
    }
  }

  async function submitPin(){
    setErr(null);
    if (pin !== PIN) { setErr("Invalid PIN"); return; }
    sessionStorage.setItem("lu_admin_ok","1");
    setOk(true);
  }

  // ===== Users =====
  async function refreshUsers(){
    setErr(null);
    const r = await fetch("/api/admin/users");
    const j = await r.json();
    if (!r.ok) { setErr(j?.error || "Failed to load users"); return; }
    setUsers(j.users || []);
  }

  async function saveUser(id: string){
    setErr(null);
    const patch = userEdits[id];
    if (!patch || Object.keys(patch).length === 0) return;
    const r = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch, xp: typeof patch.xp === "string" ? Number(patch.xp) : patch.xp }),
    });
    const j = await r.json();
    if (!r.ok) { setErr(j?.error || "Failed to update user"); return; }
    popToast("User updated");
    setUserEdits(prev => ({ ...prev, [id]: {} }));
    await refreshUsers();
  }

  // ===== Question Sets / Questions =====
  async function assignPlacement(lane: "TEST_NOW" | "TRAINING" | "CERTIFICATIONS" | "INTERVIEW") {
    try {
      setAssignMsg(null);
      const body: any = { setId: selectedSet, lane };
      if (lane === "TRAINING") body.startingPosition = assignStartPos;
      if (lane === "CERTIFICATIONS") body.certExam = assignCertExam;

      const res = await fetch("/api/admin/placements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to assign");
      setAssignMsg(`Assigned: ${lane}${lane === "TRAINING" ? " (" + assignStartPos + ")" : ""}${lane === "CERTIFICATIONS" ? " (" + assignCertExam + ")" : ""}`);
    } catch (e: any) {
      setAssignMsg(e?.message || "Failed to assign");
    }
  }

  async function refreshSets(){
    setErr(null);
    const r = await fetch("/api/admin/qsets", { cache: "no-store" as any });
    const j = await r.json();
    if (!r.ok) { setErr(j?.error || "Failed to load sets"); return; }
    const nextSets = j.sets || [];
    setSets(nextSets);
    if (selectedSet && nextSets.some((s: QuestionSet) => s.id === selectedSet)) return;
    if (nextSets?.[0]?.id) setSelectedSet(nextSets[0].id);
  }

  async function refreshQuestions(setId: string){
    if (!setId) return;
    setErr(null);
    const r = await fetch(`/api/admin/questions?setId=${encodeURIComponent(setId)}`);
    const j = await r.json();
    if (!r.ok) { setErr(j?.error || "Failed to load questions"); return; }
    setQuestions((j.questions || []).map((q: any) => ({
      ...q,
      choices: Array.isArray(q.choices) ? q.choices : safeJsonParse<string[]>(q.choices, []),
    })));
    setDirtyOrder(false);
  }

  useEffect(() => {
    if (!ok) return;
    refreshSets();
    refreshUsers();
  }, [ok]);

  useEffect(() => {
    if (ok && selectedSet) refreshQuestions(selectedSet);
  }, [ok, selectedSet]);

  async function createSet(){
    setErr(null);
    const set = await createSetRecord(newSetName, "GENERAL");
    setSelectedSet(set.id);
    popToast("Set created");
    await refreshSets();
    await refreshQuestions(set.id);
  }

  async function saveSingleQuestion(){
    setErr(null);
    if (!selectedSet) { setErr("Select a set first"); return; }
    const q = safeJsonParse<any>(qDraft, null);
    if (!q) { setErr("Invalid JSON"); return; }
    const r = await fetch("/api/admin/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setId: selectedSet, ...q }),
    });
    const j = await r.json();
    if (!r.ok) { setErr(j?.error || "Failed to save"); return; }
    popToast("Question saved");
    await refreshQuestions(selectedSet);
  }

  async function uploadJsonFile(file: File){
    setErr(null);
    let activeSetId = selectedSet;
    if (!activeSetId) {
      const autoSet = await createSetRecord(file.name.replace(/\.json$/i, ""), "GENERAL");
      activeSetId = autoSet.id;
      setSelectedSet(autoSet.id);
      await refreshSets();
    }
    const text = await file.text();
    const parsed = safeJsonParse<any>(text, null);
    if (!parsed) { setErr("Could not parse JSON file"); return; }

    const qList = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.questions) ? parsed.questions : null);
    if (!qList) { setErr("JSON must be an array or { questions: [...] }"); return; }

    // show preview modal (first 10)
    setUploadPreview(qList.slice(0, 10));

    const r = await fetch("/api/admin/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setId: activeSetId, questions: qList }),
    });
    const j = await r.json();
    if (!r.ok) { setErr(j?.error || "Upload failed"); return; }

    popToast(`Imported ${j.inserted ?? 0} question(s)`);
    await refreshQuestions(activeSetId);
  }

  function moveQuestion(idx: number, dir: -1 | 1){
    const next = [...questions];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    const a = next[idx];
    next[idx] = next[target];
    next[target] = a;
    setQuestions(next);
    setDirtyOrder(true);
  }

  async function saveOrder(){
    setErr(null);
    if (!selectedSet) return;
    const order = questions.map(q => q.id);
    const r = await fetch("/api/admin/questions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setId: selectedSet, order }),
    });
    const j = await r.json();
    if (!r.ok) { setErr(j?.error || "Failed to save order"); return; }
    popToast("Order saved");
    await refreshQuestions(selectedSet);
  }

  const selectedSetObj = useMemo(() => sets.find(s => s.id === selectedSet) || null, [sets, selectedSet]);

  if (!ok){
    return (
      <div style={{ maxWidth: 520, margin: "0 auto", padding: 18 }}>
        <div className="topbar">
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, display:"grid", placeItems:"center", background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.18)" }}>L</div>
            <div>
              <div style={{ fontWeight: 800 }}>LevelUp Pro</div>
              <small>Admin</small>
            </div>
          </div>
          <span className="badge">🔒 PIN required</span>
        </div>

        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Enter admin PIN</div>
          <div className="row" style={{ alignItems:"center" }}>
            <input value={pin} onChange={e => setPin(e.target.value)} placeholder="13371337" />
            <button className="primary" onClick={submitPin} style={{ width: 140 }}>Unlock</button>
          </div>
          {err ? <div style={{ marginTop: 10 }}><small style={{ color:"#ffb4b4" }}>{err}</small></div> : null}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin:"0 auto", padding: 18 }}>
      <div className="topbar">
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, display:"grid", placeItems:"center", background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.18)" }}>L</div>
          <div>
            <div style={{ fontWeight: 900 }}>LevelUp Pro</div>
            <small>Admin portal</small>
          </div>
        </div>

        <div className="row" style={{ alignItems:"center", gap: 10, flexWrap:"wrap", justifyContent:"flex-end" }}>
          <button onClick={() => setTab("questions")} className={tab==="questions" ? "primary" : ""}>DB Question Bank</button>
          <button onClick={() => setTab("local")} className={tab==="local" ? "primary" : ""}>Local (Prototype)</button>
          <button onClick={() => setTab("users")} className={tab==="users" ? "primary" : ""}>DB Users</button>
          <button onClick={() => (window.location.href = "/admin/content")} className="primary">Content Studio</button>
          <button className="danger" onClick={() => { sessionStorage.removeItem("lu_admin_ok"); location.reload(); }}>Lock</button>
        </div>
      </div>

      {err ? (
        <div className="card" style={{ marginTop: 14, borderColor:"rgba(255,80,80,0.35)", background:"rgba(255,80,80,0.08)" }}>
          <b>Error:</b> {err}
        </div>
      ) : null}

      {tab === "local" ? (
        <LocalPrototypeAdmin />
      ) : null}

      {tab === "users" ? (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 20 }}>User Accounts</div>
              <small>Read and edit basic fields stored in the database.</small>
            </div>
            <button onClick={refreshUsers}>Refresh</button>
          </div>

          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table className="luTable">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>User ID</th>
                  <th>XP</th>
                  <th>Starting Position</th>
                  <th>Module</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const edit = userEdits[u.id] || {};
                  return (
                    <tr key={u.id}>
                      <td>{u.email}</td>
                      <td><small>{u.id}</small></td>
                      <td style={{ width: 120 }}>
                        <input
                          value={(edit.xp ?? u.xp) as any}
                          onChange={(e) => setUserEdits(prev => ({ ...prev, [u.id]: { ...prev[u.id], xp: Number(e.target.value) } }))}
                          type="number"
                        />
                      </td>
                      <td style={{ width: 220 }}>
                        <select
                          value={(edit.startingPosition ?? u.startingPosition ?? "") as any}
                          onChange={(e) => setUserEdits(prev => ({ ...prev, [u.id]: { ...prev[u.id], startingPosition: e.target.value } }))}
                        >
                          <option value="">(none)</option>
                          <option value="HELPDESK_SUPPORT">Helpdesk Support</option>
                          <option value="DESKTOP_TECHNICIAN">Desktop Technician</option>
                          <option value="CLOUD_ENGINEER">Cloud Engineer</option>
                        </select>
                      </td>
                      <td style={{ width: 160 }}>
                        <select
                          value={(edit.moduleChoice ?? u.moduleChoice ?? "") as any}
                          onChange={(e) => setUserEdits(prev => ({ ...prev, [u.id]: { ...prev[u.id], moduleChoice: e.target.value } }))}
                        >
                          <option value="">(none)</option>
                          <option value="INTERVIEW">Interview</option>
                          <option value="CERTIFICATIONS">Certifications</option>
                          <option value="PRO_DEV">Pro Dev</option>
                        </select>
                      </td>
                      <td><small>{new Date(u.createdAt).toLocaleString()}</small></td>
                      <td style={{ width: 120 }}>
                        <button className="primary" onClick={() => saveUser(u.id)}>Save</button>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 ? (
                  <tr><td colSpan={7}><small>No users found.</small></td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "questions" ? (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap: 12, flexWrap:"wrap" }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 20 }}>DB Question Bank</div>
              <small>Create sets, import final JSON question files, and assign live placements used by the quiz and training flows.</small>
            </div>
            <div className="row" style={{ gap: 8, flexWrap:"wrap" }}>
              <button onClick={refreshSets}>Refresh sets</button>
              <button onClick={() => fileRef.current?.click()} className="primary">Import questions JSON</button>
              <button onClick={() => bulkFileRef.current?.click()} disabled={bulkImporting}>{bulkImporting ? "Bulk importing…" : "Bulk import & auto-assign"}</button>
              <button onClick={() => (window.location.href = "/admin/content")} className="secondaryBtn">Open Content Studio</button>
            </div>
          </div>

          <div style={{ marginTop: 14, display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
            <div className="card" style={{ background:"rgba(255,255,255,0.03)" }}>
              <div style={{ fontWeight: 800, marginBottom: 10 }}>Question sets</div>
              <label style={{ display:"grid", gap: 6 }}>
                <small>Select set</small>
                <select value={selectedSet} onChange={(e) => setSelectedSet(e.target.value)}>
                  <option value="">-- Select a question set --</option>
                  {sets.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} • {s.status} • {s._count?.questions ?? 0} q</option>
                  ))}
                </select>
              </label>
              <div className="row" style={{ marginTop: 10, flexWrap:"wrap" }}>
                <span className="badge">Sets: {sets.length}</span>
                {selectedSetObj ? <span className="badge">Domain: {selectedSetObj.domain}</span> : null}
                {selectedSetObj ? <span className="badge">Questions: {selectedSetObj._count?.questions ?? questions.length}</span> : null}
              </div>
              <div style={{ marginTop: 12, display:"grid", gridTemplateColumns:"1fr auto", gap: 10, alignItems:"end" }}>
                <label style={{ display:"grid", gap: 6 }}>
                  <small>Create new set</small>
                  <input value={newSetName} onChange={(e) => setNewSetName(e.target.value)} placeholder="Cloud Engineer Stage 1" />
                </label>
                <button onClick={createSet} className="primary">Create set</button>
              </div>
              <div style={{ marginTop: 12 }}>
                <small style={{ opacity: 0.8 }}>Import format: an array of questions or <code>{'{ questions: [...] }'}</code>.</small>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadJsonFile(f);
                  e.currentTarget.value = "";
                }}
              />
              <input
                ref={bulkFileRef}
                type="file"
                accept="application/json,.json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) bulkImportAndAssign(f);
                  e.currentTarget.value = "";
                }}
              />
            </div>

            <div className="card" style={{ background:"rgba(255,255,255,0.03)" }}>
              <div style={{ fontWeight: 800, marginBottom: 10 }}>Assign live placement</div>
              <div style={{ display:"grid", gap: 10 }}>
                <div className="row" style={{ gap: 8, flexWrap:"wrap" }}>
                  <button onClick={() => assignPlacement("TEST_NOW")} disabled={!selectedSet}>Set as Test Now</button>
                  <button onClick={() => assignPlacement("TRAINING")} disabled={!selectedSet}>Set as Training</button>
                  <button onClick={() => assignPlacement("CERTIFICATIONS")} disabled={!selectedSet}>Set as Certification</button>
                  <button onClick={() => assignPlacement("INTERVIEW")} disabled={!selectedSet}>Set as Interview</button>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                  <label style={{ display:"grid", gap: 6 }}>
                    <small>Training path</small>
                    <select value={assignStartPos} onChange={(e) => setAssignStartPos(e.target.value as any)}>
                      <option value="HELPDESK_SUPPORT">Helpdesk Support</option>
                      <option value="DESKTOP_TECHNICIAN">Desktop Technician</option>
                      <option value="CLOUD_ENGINEER">Cloud Engineer</option>
                    </select>
                  </label>
                  <label style={{ display:"grid", gap: 6 }}>
                    <small>Certification exam</small>
                    <select value={assignCertExam} onChange={(e) => setAssignCertExam(e.target.value as any)}>
                      <option value="A_PLUS">A+</option>
                      <option value="SECURITY_PLUS">Security+</option>
                      <option value="AZ_900">AZ-900</option>
                    </select>
                  </label>
                </div>
                <small style={{ opacity: 0.78 }}>Placements assign a full set to a live mode. For per-mode targeting, use the bulk importer to auto-create separate sets by tag/domain.</small>
                {assignMsg ? <small style={{ opacity: 0.92 }}>{assignMsg}</small> : null}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14, display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
            <div className="card" style={{ background:"rgba(255,255,255,0.03)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", gap: 10, flexWrap:"wrap", alignItems:"center" }}>
                <div>
                  <div style={{ fontWeight: 800 }}>Add one question</div>
                  <small>Useful for quick edits after your bulk import.</small>
                </div>
                <button onClick={saveSingleQuestion} className="primary" disabled={!selectedSet}>Save question</button>
              </div>
              <textarea
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                style={{ width:"100%", minHeight: 260, marginTop: 10, fontFamily:"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 12 }}
              />
            </div>

            <div className="card" style={{ background:"rgba(255,255,255,0.03)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", gap: 10, flexWrap:"wrap", alignItems:"center" }}>
                <div>
                  <div style={{ fontWeight: 800 }}>Questions in selected set</div>
                  <small>{selectedSetObj ? selectedSetObj.name : "Select a set to review imported questions."}</small>
                </div>
                <div className="row" style={{ gap: 8, flexWrap:"wrap" }}>
                  <button onClick={saveOrder} disabled={!dirtyOrder || !selectedSet}>Save order</button>
                  <span className="badge">Total: {questions.length}</span>
                </div>
              </div>
              <div style={{ marginTop: 12, maxHeight: 560, overflow:"auto", display:"grid", gap: 10 }}>
                {questions.map((q, idx) => (
                  <div key={q.id} className="card" style={{ background:"rgba(0,0,0,0.25)" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", gap: 10, flexWrap:"wrap", alignItems:"center" }}>
                      <div style={{ fontWeight: 800 }}>{idx + 1}. {q.prompt}</div>
                      <div className="row" style={{ gap: 8, flexWrap:"wrap" }}>
                        <button onClick={() => moveQuestion(idx, -1)} disabled={idx === 0}>↑</button>
                        <button onClick={() => moveQuestion(idx, 1)} disabled={idx === questions.length - 1}>↓</button>
                      </div>
                    </div>
                    <div className="row" style={{ marginTop: 8, flexWrap:"wrap" }}>
                      <span className="badge">Difficulty: {q.difficulty}</span>
                      <span className="badge">Correct: {q.correctIndex + 1}</span>
                    </div>
                    <div style={{ marginTop: 10, display:"grid", gap: 6 }}>
                      {q.choices.map((choice, choiceIndex) => (
                        <div key={choiceIndex} style={{ padding:"8px 10px", borderRadius:12, border:"1px solid rgba(255,255,255,0.08)", background: choiceIndex === q.correctIndex ? "rgba(74, 222, 128, 0.12)" : "rgba(255,255,255,0.04)" }}>
                          <small><b>{choiceIndex + 1}.</b> {choice}</small>
                        </div>
                      ))}
                    </div>
                    {q.explanation ? <div style={{ marginTop: 8 }}><small><b>Explanation:</b> {q.explanation}</small></div> : null}
                  </div>
                ))}
                {!questions.length ? <div className="card" style={{ background:"rgba(0,0,0,0.25)" }}><small>No questions in this set yet.</small></div> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Modal open={!!previewQ} title="Question preview" onClose={() => setPreviewQ(null)}>
        {previewQ ? (
          <div style={{ display:"grid", gap: 10 }}>
            <div><b>Prompt:</b> {previewQ.prompt}</div>
            <div>
              <b>Choices:</b>
              <ol style={{ marginTop: 6 }}>
                {previewQ.choices.map((c, i) => (
                  <li key={i} style={{ marginBottom: 6 }}>
                    {c} {i === previewQ.correctIndex ? <span className="badge" style={{ marginLeft: 8 }}>Correct</span> : null}
                  </li>
                ))}
              </ol>
            </div>
            {previewQ.explanation ? <div><b>Explanation:</b> {previewQ.explanation}</div> : null}
            <div className="row">
              <span className="badge">Difficulty: {previewQ.difficulty}</span>
              <span className="badge">Created: {new Date(previewQ.createdAt).toLocaleString()}</span>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!uploadPreview} title="Upload preview (first 10)" onClose={() => setUploadPreview(null)}>
        {uploadPreview ? (
          <div style={{ display:"grid", gap: 10 }}>
            <small>Showing a quick preview of what was imported. (Your file may contain more.)</small>
            <div style={{ maxHeight: 420, overflow:"auto" }}>
              {uploadPreview.map((q, i) => (
                <div key={i} className="card" style={{ marginBottom: 10, background:"rgba(255,255,255,0.03)" }}>
                  <div style={{ fontWeight: 800 }}>{i+1}. {q.prompt || "(missing prompt)"}</div>
                  <small>choices: {Array.isArray(q.choices) ? q.choices.length : 0} • correctIndex: {q.correctIndex}</small>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>

      {toast ? <Toast msg={toast} /> : null}
    </div>
  );
}
