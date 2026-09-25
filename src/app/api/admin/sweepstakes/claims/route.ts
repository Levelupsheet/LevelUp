import { prisma } from "@/lib/prisma";
import { requireAdminRequest } from "@/app/api/_lib/adminGuard";
export async function GET() {
  const guard=await requireAdminRequest(); if(!guard.ok) return guard.response;
  try {
    const claims=await prisma.$queryRawUnsafe(`SELECT c.*, s."title" AS "campaignTitle", u."displayName"
      FROM "SweepstakesPrizeClaim" c JOIN "SweepstakesCampaign" s ON s."id"=c."campaignId"
      JOIN "User" u ON u."id"=c."userId" ORDER BY c."submittedAt" DESC`);
    return Response.json({ok:true,claims});
  } catch(error){ console.error("Admin sweepstakes claims load failed",error); return Response.json({ok:false,error:"Failed to load prize claims."},{status:500}); }
}