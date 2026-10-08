import { prisma } from "@/lib/prisma";
import { buildContentPoolCatalog } from "@/lib/contentPools";
export async function getActiveContentPools() {
  const placements = await prisma.questionSetPlacement.findMany({
    where: { isActive: true, set: { status: "PUBLISHED" } }, orderBy: { createdAt: "desc" },
    include: { set: { include: { questions: true, _count: { select: { questions: true } } } } },
  });
  return buildContentPoolCatalog(placements);
}
