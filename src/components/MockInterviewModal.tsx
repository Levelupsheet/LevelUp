"use client";

import React, { useMemo, useState } from "react";
import DiabloQuizRunner from "@/components/DiabloQuizRunner";
import ProgressBar from "@/components/ProgressBar";
import { getActiveUser, setTrackProgress, type TrackId } from "@/lib/userStore";
import { addActivity } from "@/lib/activityStore";

type Track = "azure_m365" | "aws" | "helpdesk" | "desktop";
type Stage = 1 | 2;

type BossQuestion = {
  id: string;
  prompt: string;
  type: "multiple_choice" | "fill_blank" | "cli_command";
  choices?: string[];
  correctIndex?: number;
  explanation?: string;
  domainId: string;
  level: 1 | 2 | 3;
  data?: Record<string, unknown>;
};

const TRACK_META: Record<Track, { title: string; subtitle: string }> = {
  azure_m365: { title: "Azure / M365", subtitle: "Identity • Intune • Security" },
  aws: { title: "AWS", subtitle: "IAM • VPC • Compute" },
  helpdesk: { title: "Help Desk", subtitle: "Triage • Tickets • Basics" },
  desktop: { title: "Desktop Support", subtitle: "Windows • Endpoint • Fixes" },
};

const STAGE_ONE_BANK: Record<Track, BossQuestion[]> = {
  azure_m365: [
    { id: "az1", prompt: "Which control should you use to require MFA only for high-risk sign-ins?", type: "multiple_choice", choices: ["Intune", "Conditional Access", "SharePoint", "Power Automate"], correctIndex: 1, explanation: "Conditional Access evaluates sign-in signals and can require MFA.", domainId: "azure", level: 1 },
    { id: "az2", prompt: "Enter the command to connect to Azure", type: "cli_command", explanation: "Use Connect-AzAccount.", domainId: "azure", level: 1, data: { expectedCommands: ["Connect-AzAccount"], distractorCommands: ["az login", "Connect-MgGraph", "Get-AzSubscription"], placeholder: "Type the command to sign in to Azure", allowContains: true } },
    { id: "az3", prompt: "Which service manages device compliance for Conditional Access decisions?", type: "multiple_choice", choices: ["Intune", "Defender for Identity", "Exchange Online", "Purview"], correctIndex: 0, explanation: "Intune reports device compliance status.", domainId: "azure", level: 1 },
    { id: "az4", prompt: "Fill in the blank: The cloud identity service formerly known as Azure AD is Microsoft ____ ID.", type: "fill_blank", explanation: "Microsoft Entra ID is the modern name.", domainId: "azure", level: 1, data: { answers: ["Entra"], placeholder: "Type the missing word" } },
  ],
  aws: [
    { id: "aws1", prompt: "Security Groups are best described as…", type: "multiple_choice", choices: ["Stateless subnet ACLs", "Stateful instance firewalls", "S3 policies", "IAM roles"], correctIndex: 1, explanation: "Security Groups are stateful instance-level firewalls.", domainId: "aws", level: 1 },
    { id: "aws2", prompt: "Enter the AWS CLI command to list S3 buckets", type: "cli_command", explanation: "Use aws s3 ls.", domainId: "aws", level: 1, data: { expectedCommands: ["aws s3 ls"], distractorCommands: ["aws ec2 describe-instances", "aws configure list", "aws iam list-users"], placeholder: "Type an AWS CLI command", allowContains: true } },
    { id: "aws3", prompt: "Which service provides managed relational databases?", type: "multiple_choice", choices: ["RDS", "S3", "IAM", "CloudFront"], correctIndex: 0, explanation: "Amazon RDS provides managed relational databases.", domainId: "aws", level: 1 },
    { id: "aws4", prompt: "Fill in the blank: AWS identity permissions are commonly managed with ____ policies.", type: "fill_blank", explanation: "IAM policies define permissions.", domainId: "aws", level: 1, data: { answers: ["IAM"], placeholder: "Type the missing service name" } },
  ],
  helpdesk: [
    { id: "hd1", prompt: "A user says Teams is down. What should you check first?", type: "multiple_choice", choices: ["Service health", "Printer queue", "BIOS version", "Screen resolution"], correctIndex: 0, explanation: "Service health is the first check for broad M365 issues.", domainId: "helpdesk", level: 1 },
    { id: "hd2", prompt: "Enter the command to display IP configuration on Windows", type: "cli_command", explanation: "Use ipconfig or ipconfig /all.", domainId: "helpdesk", level: 1, data: { expectedCommands: ["ipconfig", "ipconfig /all"], distractorCommands: ["ping 127.0.0.1", "nslookup localhost", "netstat -ano"], placeholder: "Type a Windows networking command", allowContains: true } },
    { id: "hd3", prompt: "Which step most cleanly isolates a profile issue from an app issue?", type: "multiple_choice", choices: ["Reimage immediately", "Test with a different user profile", "Disable DNS", "Replace the keyboard"], correctIndex: 1, explanation: "Testing with a different user profile isolates whether the issue follows the user.", domainId: "helpdesk", level: 1 },
    { id: "hd4", prompt: "Fill in the blank: The STAR method stands for Situation, Task, Action, and ____.", type: "fill_blank", explanation: "Result is the final STAR step.", domainId: "helpdesk", level: 1, data: { answers: ["Result"], placeholder: "Complete the interview framework" } },
  ],
  desktop: [
    { id: "ds1", prompt: "Which tool is commonly used to review Windows application and system logs?", type: "multiple_choice", choices: ["Event Viewer", "Paint", "Task Scheduler", "Notepad"], correctIndex: 0, explanation: "Event Viewer is used for Windows log review.", domainId: "desktop", level: 1 },
    { id: "ds2", prompt: "Enter the command to check and repair protected Windows system files", type: "cli_command", explanation: "Use sfc /scannow.", domainId: "desktop", level: 1, data: { expectedCommands: ["sfc /scannow"], distractorCommands: ["chkdsk c:", "taskkill /f /im explorer.exe", "ipconfig /release"], placeholder: "Type a safe Windows repair command", allowContains: true } },
    { id: "ds3", prompt: "BitLocker recovery commonly appears after…", type: "multiple_choice", choices: ["A monitor cable change", "TPM or hardware measurement changes", "A font install", "Changing the wallpaper"], correctIndex: 1, explanation: "TPM or hardware changes can trigger BitLocker recovery.", domainId: "desktop", level: 1 },
    { id: "ds4", prompt: "Fill in the blank: DISM can repair the Windows component ____.", type: "fill_blank", explanation: "The Windows component store is repaired by DISM.", domainId: "desktop", level: 1, data: { answers: ["store"], placeholder: "Type the missing word" } },
  ],
};

const STAGE_TWO_BANK: Record<Track, BossQuestion[]> = {
  azure_m365: [
    { id: "azs2_1", prompt: "Why is least privilege important for Microsoft 365 admins?", type: "fill_blank", explanation: "Least privilege reduces blast radius and standing risk.", domainId: "azure", level: 2, data: { answers: ["reduces risk", "blast radius", "least privilege"], placeholder: "Give the core reason in a short phrase" } },
    { id: "azs2_2", prompt: "Which feature provides just-in-time admin access?", type: "multiple_choice", choices: ["PIM", "Intune", "Exchange transport rules", "OneDrive sync"], correctIndex: 0, explanation: "PIM provides just-in-time privileged access.", domainId: "azure", level: 2 },
    { id: "azs2_3", prompt: "Enter the PowerShell command to connect to Microsoft Graph", type: "cli_command", explanation: "Use Connect-MgGraph.", domainId: "azure", level: 2, data: { expectedCommands: ["Connect-MgGraph"], distractorCommands: ["Connect-AzAccount", "Get-MgUser", "New-MgUser"], placeholder: "Type a Microsoft Graph sign-in command", allowContains: true } },
  ],
  aws: [
    { id: "awss2_1", prompt: "Why are IAM roles preferred over long-lived keys on workloads?", type: "fill_blank", explanation: "Roles provide temporary credentials and reduce credential risk.", domainId: "aws", level: 2, data: { answers: ["temporary credentials", "reduce risk", "least privilege"], placeholder: "Give the main security reason" } },
    { id: "awss2_2", prompt: "Which service records AWS API activity for auditing?", type: "multiple_choice", choices: ["CloudTrail", "CloudFront", "Trusted Advisor", "GuardDuty"], correctIndex: 0, explanation: "CloudTrail records AWS API activity.", domainId: "aws", level: 2 },
    { id: "awss2_3", prompt: "Enter the AWS CLI command to identify the caller identity", type: "cli_command", explanation: "Use aws sts get-caller-identity.", domainId: "aws", level: 2, data: { expectedCommands: ["aws sts get-caller-identity"], distractorCommands: ["aws iam list-users", "aws configure list", "aws ec2 describe-vpcs"], placeholder: "Type an STS command", allowContains: true } },
  ],
  helpdesk: [
    { id: "hds2_1", prompt: "What is the best first action when many users report the same outage?", type: "fill_blank", explanation: "Check service health and confirm if it is a wider incident.", domainId: "helpdesk", level: 2, data: { answers: ["check service health", "confirm incident", "service health"], placeholder: "Answer in a short phrase" } },
    { id: "hds2_2", prompt: "Which troubleshooting principle avoids unnecessary changes?", type: "multiple_choice", choices: ["Random trial and error", "Start with the simplest likely cause", "Skip documentation", "Ignore user impact"], correctIndex: 1, explanation: "Start with the simplest likely cause before making bigger changes.", domainId: "helpdesk", level: 2 },
    { id: "hds2_3", prompt: "Enter the command to flush DNS on Windows", type: "cli_command", explanation: "Use ipconfig /flushdns.", domainId: "helpdesk", level: 2, data: { expectedCommands: ["ipconfig /flushdns"], distractorCommands: ["ipconfig /release", "nslookup google.com", "tracert 8.8.8.8"], placeholder: "Type a DNS repair command", allowContains: true } },
  ],
  desktop: [
    { id: "dss2_1", prompt: "Why should you test with a new Windows profile during troubleshooting?", type: "fill_blank", explanation: "It helps determine whether the issue is profile-specific.", domainId: "desktop", level: 2, data: { answers: ["isolate the profile", "profile-specific", "isolate user issue"], placeholder: "Give the main reason" } },
    { id: "dss2_2", prompt: "Which built-in Windows tool repairs the component store?", type: "multiple_choice", choices: ["DISM", "Paint", "Task Manager", "Regedit"], correctIndex: 0, explanation: "DISM repairs the Windows component store.", domainId: "desktop", level: 2 },
    { id: "dss2_3", prompt: "Enter the command to launch Windows System File Checker", type: "cli_command", explanation: "Use sfc /scannow.", domainId: "desktop", level: 2, data: { expectedCommands: ["sfc /scannow"], distractorCommands: ["dism /online /cleanup-image /restorehealth", "gpupdate /force", "shutdown /r /t 0"], placeholder: "Type a Windows repair command", allowContains: true } },
  ],
};

export default function MockInterviewModal(props: { open: boolean; onClose: () => void }) {
  const { open, onClose } = props;
  const [track, setTrack] = useState<Track>("azure_m365");
  const [stage, setStage] = useState<Stage>(1);
  const [step, setStep] = useState<"setup" | "quiz" | "summary">("setup");
  const [lastSummary, setLastSummary] = useState<any>(null);

  const activeUser = getActiveUser();
  const trackPct = activeUser.trackProgress?.[track as TrackId] ?? 0;
  const passedStage1 = useMemo(() => {
    try {
      return localStorage.getItem(`lu_mock_passed_s1_${track}`) === "1";
    } catch {
      return false;
    }
  }, [track, step]);

  const questions = useMemo(() => {
    return (stage === 1 ? STAGE_ONE_BANK[track] : STAGE_TWO_BANK[track]).map((q) => ({ ...q }));
  }, [track, stage]);

  function start(nextStage: Stage) {
    setStage(nextStage);
    setLastSummary(null);
    setStep("quiz");
  }

  function finishSummary(summary: any) {
    setLastSummary(summary);
    const passed = summary?.outcome === "victory" || summary?.enemyHP === 0;
    if (stage === 1 && passed) {
      try { localStorage.setItem(`lu_mock_passed_s1_${track}`, "1"); } catch {}
      setTrackProgress(track as TrackId, Math.max(trackPct, 50));
      addActivity(activeUser.id, { type: "PASS_INTERVIEW_STAGE1", title: "Boss battle cleared", body: track });
    }
    if (stage === 2 && passed) {
      setTrackProgress(track as TrackId, 100);
      addActivity(activeUser.id, { type: "PASS_INTERVIEW_STAGE2", title: "Advanced boss battle cleared", body: track });
    }
    setStep("summary");
  }

  if (!open) return null;

  return (
    <div className="luModalOverlay" role="dialog" aria-modal="true" aria-label="Boss Battle Interview" onMouseDown={onClose}>
      <div
        className="luModal"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ width: step === "quiz" ? "min(96vw, 1800px)" : "min(92vw, 1100px)", maxWidth: step === "quiz" ? 1800 : 1100, position: "relative", overflow: "hidden" }}
      >
        <div className="luVideoBg" aria-hidden="true">
          <video className="luVideoEl" autoPlay loop muted playsInline preload="metadata"><source src="/video/blackhole-loop.mp4" type="video/mp4" /></video>
          <div className="luVideoVignette" />
        </div>

        {step !== "quiz" && (
          <div className="luModalHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <b style={{ fontSize: 18 }}>Boss Battle Interview</b>
              <div><small className="luHint">Certification-style combat UI for tech and HR interview practice.</small></div>
            </div>
            <button className="secondaryBtn" type="button" onClick={onClose}>✕</button>
          </div>
        )}

        <div className="luModalBody">
          {step === "setup" && (
            <div className="grid2">
              <div className="card" style={{ gridColumn: "1 / -1" }}>
                <div className="cardTitle">Choose a track</div>
                <div className="muted">Stage 1 unlocks Stage 2 for the selected track.</div>
                <div className="trackGrid" style={{ marginTop: 14 }}>
                  {(Object.entries(TRACK_META) as [Track, { title: string; subtitle: string }][]) .map(([id, meta]) => (
                    <button key={id} className={"trackBtn" + (track === id ? " active" : "")} onClick={() => setTrack(id)}>
                      <div style={{ fontWeight: 800 }}>{meta.title}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{meta.subtitle}</div>
                      {track === id ? <div className="badge" style={{ position: "absolute", top: 10, right: 10 }}>Selected</div> : null}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
                  <div>
                    <div className="cardTitle" style={{ margin: 0 }}>{TRACK_META[track].title}</div>
                    <div className="muted">{TRACK_META[track].subtitle}</div>
                    <div className="muted" style={{ marginTop: 6 }}>Active user: <b>{activeUser.displayName}</b> • XP: <b>{activeUser.xp}</b></div>
                  </div>
                  <div style={{ minWidth: 220 }}>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Track Completion</div>
                    <ProgressBar value={trackPct} max={100} />
                    <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{trackPct}%</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                  <button className="btn primary" onClick={() => start(1)}>Start Boss Battle 1 →</button>
                  <button className="btn" disabled={!passedStage1} onClick={() => start(2)} title={passedStage1 ? "" : "Pass Stage 1 to unlock"}>Start Boss Battle 2</button>
                </div>
                <div style={{ marginTop: 10 }}>
                  {passedStage1 ? <span className="badge">✓ Stage 2 unlocked for this track</span> : <span className="badge">Defeat the first boss battle to unlock the second stage.</span>}
                </div>
              </div>
            </div>
          )}

          {step === "quiz" && (
            <DiabloQuizRunner
              title={stage === 1 ? "Mock Tech Interview" : "Mock HR Interview"}
              subtitle={`${TRACK_META[track].title} • ${stage === 1 ? "Boss Battle 1" : "Boss Battle 2"}`}
              enemyName="Lagger"
              questions={questions as any}
              timed
              metaLeft={`Stage ${stage}`}
              metaRight={TRACK_META[track].title.toUpperCase()}
              exitLabel="Close"
              onExit={onClose}
              onComplete={finishSummary}
              media={{ playerIdleSrc: "/video/player-idle.mp4", playerAttackSrc: "/video/player-attack.mp4", enemyIdleSrc: "/video/enemy-idle.mp4", enemyHitSrc: "/video/enemy-damage.mp4", width: 1600, height: 900 }}
            />
          )}

          {step === "summary" && (
            <div className="card" style={{ padding: 18 }}>
              <div className="cardTitle">Boss battle summary</div>
              <div className="muted" style={{ marginTop: 8 }}>
                Outcome: <b>{lastSummary?.outcome || "complete"}</b> • Score <b>{Number(lastSummary?.correctCount || 0)}</b> / <b>{Number(lastSummary?.totalQuestions || 0)}</b> • XP +<b>{Number(lastSummary?.xpEarned || 0)}</b>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
                <button className="btn primary" onClick={() => setStep("setup")}>Back to setup</button>
                <button className="btn" onClick={onClose}>Close</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
