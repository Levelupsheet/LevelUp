import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { findSweepstakesCampaignById } from "@/lib/sweepstakesSql";

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session?.id) return Response.json({ ok: false, error: "Sign in required" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const campaignId = String(body?.campaignId || "").trim();
    const fullName = String(body?.fullName || "").trim().slice(0, 160);
    const email = String(body?.email || session.email || "").trim().toLowerCase().slice(0, 254);
    if (!campaignId || !fullName || !email) return Response.json({ ok:false, error:"Name and email are required." }, { status:400 });
    const campaign = await findSweepstakesCampaignById(campaignId, prisma as any);
    if (!campaign || String(campaign.winnerUserId || "") !== String(session.id)) return Response.json({ ok:false, error:"Only the selected winner can submit this claim." }, { status:403 });
    const vals = {
      phone:String(body?.phone||"").trim().slice(0,40) || null,
      shippingAddress1:String(body?.shippingAddress1||"").trim().slice(0,200) || null,
      shippingAddress2:String(body?.shippingAddress2||"").trim().slice(0,200) || null,
      city:String(body?.city||"").trim().slice(0,100) || null,
      region:String(body?.region||"").trim().slice(0,100) || null,
      postalCode:String(body?.postalCode||"").trim().slice(0,30) || null,
      country:String(body?.country||"").trim().slice(0,100) || null,
      notes:String(body?.notes||"").trim().slice(0,1000) || null,
    };
    await prisma.$executeRawUnsafe(`INSERT INTO "SweepstakesPrizeClaim"
      ("id","campaignId","userId","fullName","email","phone","shippingAddress1","shippingAddress2","city","region","postalCode","country","notes","status","submittedAt","updatedAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'SUBMITTED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT ("campaignId","userId") DO UPDATE SET
      "fullName"=EXCLUDED."fullName","email"=EXCLUDED."email","phone"=EXCLUDED."phone","shippingAddress1"=EXCLUDED."shippingAddress1",
      "shippingAddress2"=EXCLUDED."shippingAddress2","city"=EXCLUDED."city","region"=EXCLUDED."region","postalCode"=EXCLUDED."postalCode",
      "country"=EXCLUDED."country","notes"=EXCLUDED."notes","updatedAt"=CURRENT_TIMESTAMP`,
      crypto.randomUUID(),campaignId,session.id,fullName,email,vals.phone,vals.shippingAddress1,vals.shippingAddress2,vals.city,vals.region,vals.postalCode,vals.country,vals.notes);
    return Response.json({ ok:true });
  } catch (error) {
    console.error("Sweepstakes prize claim failed", error);
    return Response.json({ ok:false, error:"Failed to submit prize claim." }, { status:500 });
  }
}