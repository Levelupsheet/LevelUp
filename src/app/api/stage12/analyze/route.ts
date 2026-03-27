
import { NextResponse } from "next/server";
import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { deriveStage12Profile, saveStage12Profile } from "@/lib/stage12";

async function parseWithService(fileName: string, mimeType: string, storagePath: string) {
  const serviceUrl = process.env.RESUME_SERVICE_URL || "http://localhost:8000";
  const fileBuf = await readFile(storagePath);
  const fd = new FormData();
  fd.append("file", new Blob([fileBuf], { type: mimeType || "application/octet-stream" }), fileName);
  const r = await fetch(`${serviceUrl}/parse_resume`, { method: "POST", body: fd as any });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
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
      userId = String(form.get("userId") || "");
      file = (form.get("file") as File | null) || null;
    } else {
      const body = await req.json().catch(() => ({}));
      userId = String(body?.userId || "");
    }

    userId = userId.trim();
    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

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
        parsedJson = await parseWithService(safeName, file.type || "application/octet-stream", storagePath);
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
      if (!resumeRecord) return NextResponse.json({ error: "No resume available. Upload a PDF or DOCX first." }, { status: 400 });
      parsedJson = sanitizeParsedJson(resumeRecord.parsedJson);
      if (!parsedJson) return NextResponse.json({ error: "Latest resume is missing parsed data. Upload again to analyze." }, { status: 400 });
    }

    const [user, masteryRows] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { xp: true } }),
      prisma.userDomain.findMany({ where: { userId }, select: { domain: true, xp: true }, orderBy: [{ xp: "desc" }] }),
    ]);

    const profile = deriveStage12Profile({
      userId,
      parsedJson,
      userXp: Number(user?.xp || 0),
      masteryRows,
    });

    saveStage12Profile(profile);

    return NextResponse.json({ ok: true, profile, resumeId: resumeRecord?.id || null });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to analyze resume", detail: String(err?.message || err) }, { status: 500 });
  }
}
