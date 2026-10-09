import { NextResponse } from 'next/server';
import { getActiveContentPools } from '@/lib/activePools';
import { prisma } from '@/lib/prisma';
import { learnerEligible } from '@/lib/contentPipeline';
import { PRACTICE_MODES, selectPracticeQuestions, type PracticeMode } from '@/lib/practiceFlow';
import { shuffleQuestionPayload } from '@/lib/questionTransforms';
import { hasPracticeAccess } from '@/lib/practiceAccess';
export async function POST(req: Request) {
  try {
    const body=await req.json(); const mode=String(body.mode) as PracticeMode;
    if (!Object.hasOwn(PRACTICE_MODES,mode)) return NextResponse.json({error:'Choose a supported practice mode'},{status:400});
    const bank=(await getActiveContentPools()).find(b=>b.key===body.bankKey && ['TRAINING','CERTIFICATIONS','TEST_NOW'].includes(b.lane));
    if (!bank) return NextResponse.json({error:'This bank is no longer published'},{status:404});
    if (mode==='FULL' && !await hasPracticeAccess(bank.key)) return NextResponse.json({error:'Unlock full tests for this bank first'},{status:402});
    const rows=(await prisma.mCQQuestion.findMany({where:{setId:{in:bank.setIds}}})).filter(learnerEligible);
    const ids=(value:any)=>Array.isArray(value)?value.filter(v=>typeof v==='string').slice(-10000):[];
    let applicable=rows;
    if (body.focus==='missed') { const missed=new Set(ids(body.missed)); applicable=rows.filter(q=>missed.has(q.id)); }
    if (body.focus==='weak') {
      const performance=body.domains && typeof body.domains==='object'?body.domains:{};
      const measured=Object.entries(performance).filter(([,v]:any)=>Number.isFinite(v?.total) && v.total>=2 && Number.isFinite(v.correct) && v.correct>=0 && v.correct<=v.total).sort((a:any,b:any)=>a[1].correct/a[1].total-b[1].correct/b[1].total);
      applicable=measured.length?rows.filter(q=>(q.domainId || 'general')===measured[0][0]):[];
    }
    const selected=selectPracticeQuestions(applicable,ids(body.seen),ids(body.missed),PRACTICE_MODES[mode].count,mode==='DIAGNOSTIC');
    // Publish only gameplay data, never source/import/editor metadata or account rewards.
    const questions=selected.map((q:any)=>{
      const data:any={};for(const key of ['expectedCommands','allowContains','caseSensitive','correctAnswer','hints','hint','placeholder']) if(q.data?.[key]!==undefined)data[key]=q.data[key];
      return shuffleQuestionPayload({id:q.id,prompt:q.prompt,type:q.type,choices:q.choices || [],correctIndex:q.correctIndex,data,explanation:q.explanation,domainId:q.domainId || 'general',level:q.difficulty,isGolden:false});
    });
    return NextResponse.json({questions,bankKey:bank.key,availableCount:rows.length,requestedCount:PRACTICE_MODES[mode].count},{headers:{'Cache-Control':'no-store'}});
  } catch { return NextResponse.json({error:'Could not load this practice bank. Please retry.'},{status:500}); }
}
