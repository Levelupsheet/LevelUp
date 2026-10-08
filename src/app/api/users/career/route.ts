import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { getActiveContentPools } from "@/lib/activePools";
import { normalizeCareerTarget, isPublishedCareer } from "@/lib/careerPreference";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getSessionUser();
  if (!user?.id) return Response.json({error:"Sign in required"},{status:401});
  const saved = await prisma.user.findUnique({where:{id:user.id},select:{selectedIndustry:true,selectedCareerPath:true}});
  const career = normalizeCareerTarget({industry:saved?.selectedIndustry,careerPath:saved?.selectedCareerPath});
  return Response.json({ok:true,career});
}
export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user?.id) return Response.json({error:"Sign in required"},{status:401});
  const target = normalizeCareerTarget(await req.json().catch(()=>null));
  if (!target) return Response.json({error:"Industry and career path are required (maximum 160 characters each)"},{status:400});
  if (!isPublishedCareer(target,await getActiveContentPools())) return Response.json({error:"This career does not have an active published training pool"},{status:400});
  await prisma.user.update({where:{id:user.id},data:{selectedIndustry:target.industry,selectedCareerPath:target.careerPath}});
  return Response.json({ok:true,career:target});
}
