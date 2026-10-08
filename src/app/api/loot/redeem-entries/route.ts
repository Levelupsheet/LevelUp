import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { redeemRaffleCredits } from "@/lib/raffleCredits";
export async function POST() {
  const user = await getSessionUser();
  if (!user?.id) return Response.json({error:"Sign in required"},{status:401});
  const result = await prisma.$transaction((tx: any) => redeemRaffleCredits(tx,user.id));
  return Response.json({ok:true,...result as any});
}
