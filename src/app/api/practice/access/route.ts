import { NextResponse } from 'next/server';
import { getActiveContentPools } from '@/lib/activePools';
import { prisma } from '@/lib/prisma';
import { practicePrice } from '@/lib/practiceFlow';
import { practiceOwner, purchaseOwnerFilter, hasPracticeAccess, verifiedPracticeCapture } from '@/lib/practiceAccess';
import { getPayPalAccessToken, paypalBaseUrl, appBaseUrl } from '@/lib/paypal';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    const bankKey=new URL(req.url).searchParams.get('bankKey') || '';
    const bank=(await getActiveContentPools()).find(b=>b.key===bankKey && ['TRAINING','CERTIFICATIONS','TEST_NOW'].includes(b.lane));
    if (!bank) return NextResponse.json({error:'Published bank not found'},{status:404});
    const amountCents=practicePrice(process.env.FULL_TEST_PRICE_USD);
    return NextResponse.json({unlocked:await hasPracticeAccess(bankKey),amountCents,currency:'USD',checkoutEnabled:!!amountCents && !!process.env.PAYPAL_CLIENT_SECRET && !!(process.env.PAYPAL_CLIENT_ID || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID)});
  } catch { return NextResponse.json({error:'Could not check full-test access'},{status:500}); }
}
export async function POST(req: Request): Promise<Response> {
  // Checkout is a same-origin operation; ownership never comes from request JSON.
  const origin=req.headers.get('origin');
  if (origin && origin!==new URL(appBaseUrl(req)).origin) return NextResponse.json({error:'Invalid origin'},{status:403});
  try {
    const body=await req.json(); const owner=await practiceOwner(true);
    if (body.action==='capture') {
      const purchase=await prisma.practicePurchase.findFirst({where:{orderId:String(body.orderId || ''),...purchaseOwnerFilter(owner)}});
      if (!purchase) return NextResponse.json({error:'Purchase not found'},{status:404});
      if (purchase.status==='REVOKED') return NextResponse.json({error:'This purchase was refunded or reversed'},{status:409});
      if (purchase.status==='PAID') return NextResponse.json({unlocked:true,bankKey:purchase.bankKey});
      return await prisma.$transaction<Response>(async tx => {
      for (const identity of [...new Set([purchase.ownerHash, owner.userId].filter(Boolean))].sort()) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`practice:${identity}:${purchase.bankKey}`}))`;
      }
      const paid=await tx.practicePurchase.findFirst({where:{bankKey:purchase.bankKey,status:'PAID',...purchaseOwnerFilter(owner)}});
      if (paid) return NextResponse.json({unlocked:true,bankKey:purchase.bankKey});
      const latest=await tx.practicePurchase.findUnique({where:{id:purchase.id}});
      if (latest?.status==='REVOKED') return NextResponse.json({error:'Purchase was refunded or reversed'},{status:409});
      const token=await getPayPalAccessToken();
      const response=await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(purchase.orderId!)}/capture`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'return=representation','PayPal-Request-Id':`practice-capture-${purchase.id}`}});
      let order=await response.json();
      if (!response.ok) {
        const lookup=await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(purchase.orderId!)}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
        if (!lookup.ok) throw Error('Payment confirmation failed');
        order=await lookup.json();
      }
      if (!verifiedPracticeCapture(order,purchase)) return NextResponse.json({error:'Payment is not completed or does not match this purchase'},{status:409});
      await tx.practicePurchase.updateMany({where:{id:purchase.id,status:'CREATED'},data:{status:'PAID',paidAt:new Date(),captureId:order.purchase_units[0].payments.captures[0].id}});
      const settled=await tx.practicePurchase.findUnique({where:{id:purchase.id}});
      if (settled?.status!=='PAID') return NextResponse.json({error:'Payment access could not be confirmed'},{status:409});
      return NextResponse.json({unlocked:true,bankKey:purchase.bankKey});
      },{timeout:30000});
    }
    if (body.action!=='create') return NextResponse.json({error:'Invalid checkout action'},{status:400});
    const bank=(await getActiveContentPools()).find(b=>b.key===body.bankKey && ['TRAINING','CERTIFICATIONS','TEST_NOW'].includes(b.lane));
    if (!bank) return NextResponse.json({error:'Published bank not found'},{status:404});
    if (await hasPracticeAccess(bank.key)) return NextResponse.json({unlocked:true});
    const amountCents=practicePrice(process.env.FULL_TEST_PRICE_USD);
    if (!amountCents) return NextResponse.json({error:'Full-test checkout is not configured yet. Free practice is available.'},{status:503});
    const token=await getPayPalAccessToken();
    const purchase=await prisma.practicePurchase.create({data:{bankKey:bank.key,...owner,amountCents}});
    const base=appBaseUrl(req);
    const response=await fetch(`${paypalBaseUrl()}/v2/checkout/orders`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'return=representation','PayPal-Request-Id':`practice-order-${purchase.id}`},body:JSON.stringify({intent:'CAPTURE',purchase_units:[{reference_id:purchase.id,description:`LevelUp full tests: ${bank.label}`,amount:{currency_code:'USD',value:(amountCents/100).toFixed(2)}}],application_context:{return_url:`${base}/learn?bank=${encodeURIComponent(bank.key)}&practiceCheckout=1`,cancel_url:`${base}/learn?bank=${encodeURIComponent(bank.key)}`,user_action:'PAY_NOW'}})});
    const order=await response.json();
    const approveUrl=order.links?.find((link:any)=>link.rel==='approve')?.href;
    if (!response.ok || !order.id || !approveUrl) throw Error('Could not create checkout');
    await prisma.practicePurchase.update({where:{id:purchase.id},data:{orderId:order.id}});
    return NextResponse.json({approveUrl});
  } catch (error) { console.error('Practice checkout failed',error); return NextResponse.json({error:'Could not complete checkout. Please retry; access is granted only after confirmed payment.'},{status:500}); }
}
