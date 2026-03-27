import { NextResponse } from "next/server";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { deriveStage12Profile, saveStage12Profile } from "@/lib/stage12";

export const runtime = "nodejs";

function cleanLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function unique(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = cleanLine(String(value || "")).toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(cleanLine(String(value || "")));
  }
  return out;
}

function firstMatch(text: string, regex: RegExp) {
  const match = text.match(regex);
  return match?.[1] ? cleanLine(match[1]) : "";
}

function extractSection(text: string, headings: string[]) {
  const lines = text.split(/\r?\n/).map((line) => cleanLine(line)).filter(Boolean);
  const upperHeadings = headings.map((heading) => heading.toUpperCase());
  const allKnownHeadings = [
    "SUMMARY",
    "PROFESSIONAL SUMMARY",
    "PROFILE",
    "EXPERIENCE",
    "WORK EXPERIENCE",
    "EMPLOYMENT",
    "EDUCATION",
    "CERTIFICATIONS",
    "CERTIFICATES",
    "SKILLS",
    "TECHNICAL SKILLS",
    "CORE SKILLS",
    "PROJECTS",
  ];

  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (upperHeadings.includes(lines[i].toUpperCase())) {
      start = i + 1;
      break;
    }
  }

  if (start < 0) return [];

  const out: string[] = [];
  for (let i = start; i < lines.length; i += 1) {
    const upper = lines[i].toUpperCase();
    if (allKnownHeadings.includes(upper)) break;
    out.push(lines[i]);
  }

  return out;
}

function splitSkillTokens(text: string) {
  const normalized = text
    .replace(/\u2022/g, ",")
    .replace(/[|/]/g, ",")
    .replace(/\s+-\s+/g, ", ")
    .replace(/\s{2,}/g, " ");

  return normalized
    .split(/,|\n/)
    .map((part) => cleanLine(part))
    .filter((part) => part && part.length <= 60);
}

function inferKeywords(text: string) {
  const candidates = [
    "Azure",
    "AWS",
    "Entra ID",
    "Azure AD",
    "Microsoft 365",
    "Office 365",
    "Intune",
    "Conditional Access",
    "PowerShell",
    "Active Directory",
    "Group Policy",
    "Windows Server",
    "Linux",
    "Bash",
    "DNS",
    "DHCP",
    "TCP/IP",
    "VPN",
    "Firewall",
    "MFA",
    "Defender",
    "Sentinel",
    "BitLocker",
    "EC2",
    "S3",
    "IAM",
    "VPC",
    "CloudWatch",
    "RDS",
    "Exchange Online",
    "SharePoint",
    "Teams",
    "Help Desk",
    "Desktop Support",
    "Troubleshooting",
    "Security+",
    "Network+",
    "A+",
    "AZ-900",
    "AZ-104",
    "SC-900",
    "MS-102",
  ];

  const lower = text.toLowerCase();
  return candidates.filter((keyword) => lower.includes(keyword.toLowerCase()));
}

async function extractTextFromResume(file: File, storagePath: string) {
  const fileName = (file.name || "").toLowerCase();
  const mimeType = (file.type || "").toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (
    mimeType.includes("pdf") ||
    fileName.endsWith(".pdf")
  ) {
    const pdfParseModule: any = await import("pdf-parse");
    const pdfParse = pdfParseModule.default || pdfParseModule;
    const parsed = await pdfParse(buffer);
    return cleanLine(String(parsed?.text || "")).replace(/\. /g, ".\n");
  }

  if (
    mimeType.includes("wordprocessingml.document") ||
    fileName.endsWith(".docx")
  ) {
    const mammothModule: any = await import("mammoth");
    const mammoth = mammothModule.default || mammothModule;
    const result = await mammoth.extractRawText({ buffer });
    return String(result?.value || "");
  }

  throw new Error("Unsupported file type. Please upload a PDF or DOCX resume.");
}

function buildParsedJsonFromText(text: string) {
  const normalizedText = String(text || "").replace(/\r/g, "");
  const lines = normalizedText
    .split("\n")
    .map((line) => cleanLine(line))
    .filter(Boolean);

  const basics = {
    name: lines[0] || "",
    email: firstMatch(normalizedText, /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i),
    phone: firstMatch(
      normalizedText,
      /(\+?\d[\d\s().-]{7,}\d)/
    ),
  };

  const headline =
    extractSection(normalizedText, ["SUMMARY", "PROFESSIONAL SUMMARY", "PROFILE"]).join(" ").slice(0, 500) ||
    lines.slice(1, 4).join(" ").slice(0, 500);

  const experience = extractSection(normalizedText, ["EXPERIENCE", "WORK EXPERIENCE", "EMPLOYMENT"]).slice(0, 12);
  const education = extractSection(normalizedText, ["EDUCATION"]).slice(0, 8);
  const skillsSection = extractSection(normalizedText, ["SKILLS", "TECHNICAL SKILLS", "CORE SKILLS"]);

  const rawSkills = unique([
    ...splitSkillTokens(skillsSection.join(", ")),
    ...inferKeywords(normalizedText),
  ]).slice(0, 30);

  const keywords = unique([
    ...inferKeywords(normalizedText),
    ...rawSkills,
  ]).slice(0, 40);

  return {
    basics,
    headline,
    skills: rawSkills,
    keywords,
    experience,
    education,
  };
}

function sanitizeParsedJson(parsedJson: any) {
  if (!parsedJson || typeof parsedJson !== "object") return parsedJson;
  const clone = { ...parsedJson };
  delete (clone as any).rawTextPreview;
  return clone;
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let userId = "";
    let file: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      userId = String(form.get("userId") || "").trim();
      file = (form.get("file") as File | null) || null;
    } else {
      const body = await req.json().catch(() => ({}));
      userId = String(body?.userId || "").trim();
    }

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    let resumeRecord: any = null;
    let parsedJson: any = null;

    if (file) {
      const safeName = (file.name || "resume").replace(/[^a-zA-Z0-9._-]+/g, "_");
      const dir = path.join(process.cwd(), "tmp", "resumes", userId);

      await mkdir(dir, { recursive: true });

      const storagePath = path.join(dir, `${Date.now()}-${safeName}`);
      await writeFile(storagePath, Buffer.from(await file.arrayBuffer()));

      resumeRecord = await prisma.resumeFile.create({
        data: {
          userId,
          fileName: safeName,
          mimeType: file.type || "application/octet-stream",
          storageKey: `TEMP_DELETED:${safeName}`,
        },
      });

      try {
        const resumeText = await extractTextFromResume(file, storagePath);
        parsedJson = buildParsedJsonFromText(resumeText);
      } finally {
        await unlink(storagePath).catch(() => {});
      }

      parsedJson = sanitizeParsedJson(parsedJson);

      await prisma.resumeFile.update({
        where: { id: resumeRecord.id },
        data: {
          parsedAt: new Date(),
          parsedJson,
        },
      });
    } else {
      resumeRecord = await prisma.resumeFile.findFirst({
        where: { userId },
        orderBy: { uploadedAt: "desc" },
      });

      if (!resumeRecord) {
        return NextResponse.json(
          { error: "No resume available. Upload a PDF or DOCX first." },
          { status: 400 }
        );
      }

      parsedJson = sanitizeParsedJson(resumeRecord.parsedJson);

      if (!parsedJson) {
        return NextResponse.json(
          { error: "Latest resume is missing parsed data. Upload again to analyze." },
          { status: 400 }
        );
      }
    }

    const [user, masteryRows] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { xp: true },
      }),
      prisma.userDomain.findMany({
        where: { userId },
        select: { domain: true, xp: true },
        orderBy: [{ xp: "desc" }],
      }),
    ]);

    const profile = deriveStage12Profile({
      userId,
      parsedJson,
      userXp: Number(user?.xp || 0),
      masteryRows,
    });

    await saveStage12Profile(profile);

    return NextResponse.json({
      ok: true,
      profile,
      resumeId: resumeRecord?.id || null,
    });
  } catch (err: any) {
    console.error("STAGE12_ANALYZE_ERROR", err);

    return NextResponse.json(
      {
        error: "Failed to analyze resume",
        detail: String(err?.message || err),
      },
      { status: 500 }
    );
  }
}
