import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRequest } from "@/app/api/_lib/adminGuard";
import { summarizeJobDescription } from "@/lib/jobOpenings";

export async function GET() {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  const jobs = await prisma.jobOpening.findMany({ orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }] });
  return NextResponse.json({ jobs });
}

export async function POST(req: Request) {
  const admin = await requireAdminRequest();
  if (!admin.ok) return admin.response;
  try {
    const body = await req.json();
    const action = String(body?.action || "create");

    if (action === "delete") {
      if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      await prisma.jobOpening.delete({ where: { id: String(body.id) } });
      return NextResponse.json({ ok: true });
    }

    if (action === "toggle") {
      if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const next = await prisma.jobOpening.update({ where: { id: String(body.id) }, data: { isActive: Boolean(body.isActive) } });
      return NextResponse.json({ ok: true, job: next });
    }

    const title = String(body?.title || "").trim();
    const companyName = String(body?.companyName || "").trim();
    const description = String(body?.description || "").trim();
    const applyUrl = String(body?.applyUrl || "").trim();
    if (!title || !companyName || !description || !applyUrl) {
      return NextResponse.json({ error: "title, companyName, description, and applyUrl are required" }, { status: 400 });
    }

    const summary = summarizeJobDescription(body);
    const payload = {
      title,
      companyName,
      locationText: body?.locationText ? String(body.locationText) : null,
      employmentType: body?.employmentType ? String(body.employmentType) : null,
      salaryText: body?.salaryText ? String(body.salaryText) : null,
      description,
      applyUrl,
      sourceLabel: body?.sourceLabel ? String(body.sourceLabel) : null,
      sourceUrl: body?.sourceUrl ? String(body.sourceUrl) : null,
      isActive: body?.isActive !== false,
      sortOrder: Number(body?.sortOrder || 0) || 0,
      summaryShort: String(body?.summaryShort || summary.summaryShort),
      summaryBullets: Array.isArray(body?.summaryBullets) && body.summaryBullets.length ? body.summaryBullets.map((v: unknown) => String(v)) : summary.summaryBullets,
    };

    const job = body?.id
      ? await prisma.jobOpening.update({ where: { id: String(body.id) }, data: payload })
      : await prisma.jobOpening.create({ data: payload });

    return NextResponse.json({ ok: true, job });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to save job opening" }, { status: 500 });
  }
}
