import { createHash, randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { getSessionUser } from '@/lib/auth/session';
import { isAdminEmail } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';
export async function practiceOwner(create = false) {
  const jar = await cookies();
  let token = jar.get('levelup_practice_owner')?.value || '';
  if (!/^[a-f0-9]{64}$/.test(token)) {
    token = create ? randomBytes(32).toString('hex') : '';
    if (token) jar.set('levelup_practice_owner', token, {httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:365*24*3600});
  }
  const user = await getSessionUser();
  return { ownerHash: token ? createHash('sha256').update(token).digest('hex') : '', userId: user?.id || null };
}
export function purchaseOwnerFilter(owner: {ownerHash:string;userId:string|null}) {
  return { OR: [...(owner.ownerHash ? [{ownerHash:owner.ownerHash,userId:null}] : []), ...(owner.userId ? [{userId:owner.userId}] : [])] };
}
export async function hasPracticeAccess(bankKey: string) {
  const user = await getSessionUser();
  if (user && isAdminEmail(user.email)) return true;
  const owner = await practiceOwner();
  if (!owner.ownerHash && !owner.userId) return false;
  return !!await prisma.practicePurchase.findFirst({where:{bankKey,status:'PAID',...purchaseOwnerFilter(owner)}});
}
export function verifiedPracticeCapture(order: any, purchase: {orderId:string|null;id:string;amountCents:number;currency:string}) {
  const unit=order?.purchase_units?.[0], captures=unit?.payments?.captures;
  return order?.id===purchase.orderId && order.status==='COMPLETED' && order.purchase_units.length===1 && unit.reference_id===purchase.id && captures?.length===1 && captures[0].status==='COMPLETED' && captures[0].amount?.currency_code===purchase.currency && Math.round(Number(captures[0].amount?.value)*100)===purchase.amountCents;
}

/** Called only after the existing PayPal signature verification succeeds. */
export async function applyPracticeWebhook(event: any) {
  const resource=event?.resource || {}, type=String(event?.event_type || '');
  if(type==='PAYMENT.CAPTURE.COMPLETED') {
    const orderId=resource.supplementary_data?.related_ids?.order_id;
    if (!orderId || resource.status!=='COMPLETED') return;
    const purchase=await prisma.practicePurchase.findUnique({where:{orderId}});
    if(purchase && resource.amount?.currency_code===purchase.currency && Math.round(Number(resource.amount?.value)*100)===purchase.amountCents)
      await prisma.practicePurchase.updateMany({where:{id:purchase.id,status:'CREATED'},data:{status:'PAID',captureId:resource.id,paidAt:new Date()}});
  }
  if(type==='PAYMENT.CAPTURE.REFUNDED' || type==='PAYMENT.CAPTURE.REVERSED') {
    const up=resource.links?.find((l:any)=>l.rel==='up')?.href || '';
    const captureId=resource.supplementary_data?.related_ids?.capture_id || (type==='PAYMENT.CAPTURE.REVERSED'?resource.id:/\/captures\/([^/?]+)/.exec(up)?.[1]) || resource.id;
    if(captureId) await prisma.practicePurchase.updateMany({where:{captureId},data:{status:'REVOKED'}});
  }
}
