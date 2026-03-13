import { requireAdminRequest } from "@/app/api/_lib/adminGuard";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const guard = await requireAdminRequest();
  if (!guard.ok) return guard.response;

  try {
    const flags = await prisma.suspiciousAccountFlag.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
    });

    return Response.json({ ok: true, flags });
  } catch (error: any) {
    return Response.json({ ok: false, error: "Failed to load suspicious account flags", detail: String(error?.message || error) }, { status: 500 });
  }
}
