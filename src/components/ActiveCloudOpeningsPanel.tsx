"use client";

import { useEffect, useMemo, useState } from "react";

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
};

function compactSummary(job: JobOpening) {
  const base = String(job.summaryShort || job.description || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[•*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const raw = base.length > 240 ? base.slice(0, 240) : base;
  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const picked = (sentences.slice(0, 2).join(" ") || raw).trim();
  if (!picked) {
    return `${job.companyName}${job.locationText ? ` • ${job.locationText}` : ""}${job.employmentType ? ` • ${job.employmentType}` : ""}`;
  }
  return picked.length > 125 ? `${picked.slice(0, 122).trimEnd()}…` : picked;
}

function JobModal({ job, onClose }: { job: JobOpening | null; onClose: () => void }) {
  if (!job) return null;
  return (
    <div className="luModalOverlay" onMouseDown={onClose}>
      <div className="luModal luJobModal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={job.title}>
        <div className="luModalHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <b style={{ fontSize: 22 }}>{job.title}</b>
            <div><small className="luHint">{job.companyName}{job.locationText ? ` • ${job.locationText}` : ""}{job.employmentType ? ` • ${job.employmentType}` : ""}</small></div>
          </div>
          <button className="secondaryBtn" type="button" onClick={onClose}>✕</button>
        </div>
        <div className="luModalBody luJobModalBody">
          <div className="jobMetaPills">
            {job.salaryText ? <span className="badge">{job.salaryText}</span> : null}
            {job.sourceLabel ? <span className="badge">{job.sourceLabel}</span> : null}
          </div>
          <div className="jobSummaryLead">{compactSummary(job)}</div>
          {job.summaryBullets?.length ? (
            <div className="jobBulletList">
              {job.summaryBullets.map((line, idx) => <div key={idx} className="jobBulletItem">• {line}</div>)}
            </div>
          ) : null}
          <div className="jobDescriptionText">{job.description}</div>
        </div>
        <div className="luModalFooter" style={{ justifyContent: "space-between" }}>
          <button className="secondaryBtn" type="button" onClick={onClose}>Close</button>
          <a className="primaryBtn" href={job.applyUrl} target="_blank" rel="noreferrer">Apply on official site</a>
        </div>
      </div>
    </div>
  );
}

export default function ActiveCloudOpeningsPanel({ jobs }: { jobs: JobOpening[] }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [viewing, setViewing] = useState<JobOpening | null>(null);

  useEffect(() => {
    if (jobs.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % jobs.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [jobs.length]);

  const visibleJobs = useMemo(() => {
    if (!jobs.length) return [];
    const ordered = [] as JobOpening[];
    for (let i = 0; i < Math.min(4, jobs.length); i += 1) ordered.push(jobs[(activeIdx + i) % jobs.length]);
    return ordered;
  }, [jobs, activeIdx]);

  return (
    <>
      <div className="card">
        <div className="sectionHead">
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 6 }}>Active Cloud Openings:</h3>
            <small>Summarized roles curated from the admin portal. View details or jump straight to the official application.</small>
          </div>
          {jobs.length ? <span className="badge">Live roles: {jobs.length}</span> : null}
        </div>
        {!jobs.length ? (
          <div className="emptyStateCard">No active cloud openings yet. Add one from the admin portal.</div>
        ) : (
          <div className="jobScrollerGrid">
            {visibleJobs.map((job) => (
              <div key={job.id} className="jobCard">
                <div className="jobCardTop">
                  <div>
                    <div className="jobCardTitle">{job.title}</div>
                    <div className="jobCardMeta">{job.companyName}{job.locationText ? ` • ${job.locationText}` : ""}</div>
                  </div>
                  {job.salaryText ? <span className="badge">{job.salaryText}</span> : null}
                </div>
                <div className="jobCardSummary">{compactSummary(job)}</div>
                <div className="jobCardActions">
                  <button className="secondaryBtn" type="button" onClick={() => setViewing(job)}>View</button>
                  <a className="primaryBtn" href={job.applyUrl} target="_blank" rel="noreferrer">Apply</a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <JobModal job={viewing} onClose={() => setViewing(null)} />
    </>
  );
}
