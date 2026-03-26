import { prisma } from "../../../_lib/prisma";

function parseSummary(value?: string | null) {
  if (!value) return value;
  try { return JSON.parse(value); } catch { return value; }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return Response.json({ error: "userId required" }, { status: 400 });

  const latest = await prisma.interviewSession.findFirst({
    where: { userId, kind: "TECH", status: "FINISHED" },
    orderBy: { finishedAt: "desc" },
    select: { pass: true, finishedAt: true, scoreAvg: true, summary: true },
  });

  return Response.json({ ok: true, passed: Boolean(latest?.pass), latest: latest ? { ...latest, summary: parseSummary(latest.summary) } : null });
}
