import { NextResponse } from 'next/server';
import { requireAdminRequest } from '@/app/api/_lib/adminGuard';
import { prisma } from '@/lib/prisma';
import { importEnvelope, contentImportReport } from '@/lib/contentImport';
import { duplicateContentReason } from '@/lib/contentGeneration';
import { validateContent } from '@/lib/contentPipeline';
export async function POST(req: Request) {
  const admin = await requireAdminRequest(); if (!admin.ok) return admin.response;
  try {
    const body = await req.json();
    const setId = body.setId ? String(body.setId) : '';
    const pool = setId ? await prisma.questionSet.findUnique({where:{id:setId},include:{questions:true}}) : null;
    if (setId && !pool) return NextResponse.json({error:'Pool not found'},{status:404});
    const seen = [...(pool?.questions || [])], questions: any[] = [], issues: any[] = [];
    let duplicates = 0;
    for (const raw of importEnvelope(body.questions ?? body.blocks ?? body)) {
      try {
        const report = contentImportReport(raw); issues.push(...report.issues);
        for (const q of report.questions) {
          const errors = validateContent(q), duplicate = duplicateContentReason(q,seen);
          if (duplicate) duplicates++;
          if (errors.length || duplicate) issues.push({reason:errors.join('; ') || duplicate,payload:q});
          else { seen.push(q); questions.push(q); }
        }
      } catch (error: any) { issues.push({reason:error.message,payload:raw}); }
    }
    return NextResponse.json({preview:true,willInsert:questions.length,duplicates,issues,byDifficulty:Object.fromEntries([1,2,3,4,5].map(t=>[t,questions.filter(q=>q.difficulty===t).length])),byFormat:Object.fromEntries(['MULTIPLE_CHOICE','TRUE_FALSE','CLI_COMMAND'].map(t=>[t,questions.filter(q=>String(q.type).toUpperCase()===t).length])),questions}, {headers:{'Cache-Control':'private, no-store'}});
  } catch { return NextResponse.json({error:'Could not preview content. Check the JSON and retry.'},{status:400}); }
}
