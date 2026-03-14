"use client";

import { useEffect, useState } from "react";

type JobOpening = {
  id: string;
  title: string;
  companyName: string;
  locationText?: string | null;
  employmentType?: string | null;
  salaryText?: string | null;
  summaryShort: string;
  summaryBullets?: string[];
  description: string;
  applyUrl: string;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  isActive: boolean;
  sortOrder: number;
};

const emptyDraft = {
  id: "",
  title: "",
  companyName: "",
  locationText: "",
  employmentType: "Remote",
  salaryText: "",
  summaryShort: "",
  description: "",
  applyUrl: "",
  sourceLabel: "LinkedIn",
  sourceUrl: "",
  isActive: true,
  sortOrder: 0,
};

export default function JobOpeningsAdmin() {
  const [jobs, setJobs] = useState<JobOpening[]>([]);
  const [draft, setDraft] = useState<any>(emptyDraft);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setErr(null);
    const res = await fetch("/api/admin/job-openings", { cache: "no-store" as any });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setErr(data?.error || "Failed to load job openings");
      return;
    }
    setJobs(data?.jobs || []);
  }

  useEffect(() => { refresh(); }, []);

  async function saveJob() {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/job-openings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to save job opening");
      setMsg(draft.id ? "Job opening updated" : "Job opening saved and activated");
      setDraft(emptyDraft);
      await refresh();
    } catch (e: any) {
      setErr(e?.message || "Failed to save job opening");
    } finally {
      setSaving(false);
    }
  }

  async function removeJob(id: string) {
    if (!confirm("Delete this job opening?")) return;
    const res = await fetch("/api/admin/job-openings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setErr(data?.error || "Failed to delete job opening");
      return;
    }
    setMsg("Job opening deleted");
    if (draft.id === id) setDraft(emptyDraft);
    await refresh();
  }

  async function toggleActive(id: string, isActive: boolean) {
    const res = await fetch("/api/admin/job-openings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle", id, isActive }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setErr(data?.error || "Failed to update status");
      return;
    }
    setMsg(isActive ? "Job opening activated" : "Job opening deactivated");
    await refresh();
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 20 }}>Active Cloud Openings</div>
          <small>Paste a LinkedIn or official job description, save the role, and it will appear on the dashboard job carousel.</small>
        </div>
        <button onClick={refresh}>Refresh jobs</button>
      </div>

      {err ? <div className="card" style={{ marginTop: 12, borderColor: "rgba(255,80,80,0.35)", background: "rgba(255,80,80,0.08)" }}>{err}</div> : null}
      {msg ? <div className="card" style={{ marginTop: 12, borderColor: "rgba(96,165,250,0.35)", background: "rgba(96,165,250,0.10)" }}>{msg}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(340px, 1.1fr) minmax(320px, 0.9fr)", gap: 14, marginTop: 14 }}>
        <div className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>{draft.id ? "Edit job opening" : "Create job opening"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}><small>Role title</small><input value={draft.title} onChange={(e) => setDraft((d: any) => ({ ...d, title: e.target.value }))} /></label>
            <label style={{ display: "grid", gap: 6 }}><small>Company</small><input value={draft.companyName} onChange={(e) => setDraft((d: any) => ({ ...d, companyName: e.target.value }))} /></label>
            <label style={{ display: "grid", gap: 6 }}><small>Location</small><input value={draft.locationText} onChange={(e) => setDraft((d: any) => ({ ...d, locationText: e.target.value }))} placeholder="Remote • Virginia" /></label>
            <label style={{ display: "grid", gap: 6 }}><small>Employment type</small><input value={draft.employmentType} onChange={(e) => setDraft((d: any) => ({ ...d, employmentType: e.target.value }))} placeholder="Remote" /></label>
            <label style={{ display: "grid", gap: 6 }}><small>Salary</small><input value={draft.salaryText} onChange={(e) => setDraft((d: any) => ({ ...d, salaryText: e.target.value }))} placeholder="$120k-$145k" /></label>
            <label style={{ display: "grid", gap: 6 }}><small>Apply URL</small><input value={draft.applyUrl} onChange={(e) => setDraft((d: any) => ({ ...d, applyUrl: e.target.value }))} placeholder="https://..." /></label>
            <label style={{ display: "grid", gap: 6 }}><small>Source label</small><input value={draft.sourceLabel} onChange={(e) => setDraft((d: any) => ({ ...d, sourceLabel: e.target.value }))} placeholder="LinkedIn" /></label>
            <label style={{ display: "grid", gap: 6 }}><small>Source URL</small><input value={draft.sourceUrl} onChange={(e) => setDraft((d: any) => ({ ...d, sourceUrl: e.target.value }))} placeholder="Optional source URL" /></label>
            <label style={{ display: "grid", gap: 6 }}><small>Sort order</small><input type="number" value={draft.sortOrder} onChange={(e) => setDraft((d: any) => ({ ...d, sortOrder: Number(e.target.value) || 0 }))} /></label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 26 }}><input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft((d: any) => ({ ...d, isActive: e.target.checked }))} /> <small>Show on dashboard</small></label>
          </div>
          <label style={{ display: "grid", gap: 6, marginTop: 10 }}><small>Dashboard summary</small><textarea value={draft.summaryShort} onChange={(e) => setDraft((d: any) => ({ ...d, summaryShort: e.target.value }))} style={{ width: "100%", minHeight: 72 }} placeholder="Leave blank to auto-generate from the pasted description" /></label>
          <label style={{ display: "grid", gap: 6, marginTop: 10 }}><small>Full job description</small><textarea value={draft.description} onChange={(e) => setDraft((d: any) => ({ ...d, description: e.target.value }))} style={{ width: "100%", minHeight: 220 }} placeholder="Paste the LinkedIn or official job description here" /></label>
          <div className="row" style={{ marginTop: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
            {draft.id ? <button className="secondaryBtn" onClick={() => setDraft(emptyDraft)}>Cancel edit</button> : null}
            <button className="primary" onClick={saveJob} disabled={saving}>{saving ? "Saving…" : draft.id ? "Update opening" : "Save opening"}</button>
          </div>
        </div>

        <div className="card" style={{ background: "rgba(255,255,255,0.03)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div style={{ fontWeight: 800 }}>Live openings</div>
            <span className="badge">Total: {jobs.length}</span>
          </div>
          <div style={{ maxHeight: 720, overflow: "auto", display: "grid", gap: 10, marginTop: 10 }}>
            {jobs.map((job) => (
              <div key={job.id} className="card" style={{ background: "rgba(0,0,0,0.20)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{job.title}</div>
                    <small>{job.companyName}{job.locationText ? ` • ${job.locationText}` : ""}</small>
                  </div>
                  <span className="badge">{job.isActive ? "Active" : "Hidden"}</span>
                </div>
                <div style={{ marginTop: 8, opacity: 0.88 }}>{job.summaryShort}</div>
                <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
                  <button className="secondaryBtn" onClick={() => setDraft(job)}>Edit</button>
                  <button onClick={() => toggleActive(job.id, !job.isActive)}>{job.isActive ? "Hide" : "Activate"}</button>
                  <a className="secondaryBtn" href={job.applyUrl} target="_blank" rel="noreferrer">Apply URL</a>
                  <button className="danger" onClick={() => removeJob(job.id)}>Delete</button>
                </div>
              </div>
            ))}
            {!jobs.length ? <div className="emptyStateCard">No active cloud openings yet.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
