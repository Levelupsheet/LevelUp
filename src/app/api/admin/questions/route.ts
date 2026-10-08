import { NextResponse } from 'next/server';
import { requireAdminRequest } from '@/app/api/_lib/adminGuard';
import { prisma } from '@/lib/prisma';
import { auditContent, authorQuestion, contentSignature, validateContent, DIFFICULTY_TIERS } from '@/lib/contentPipeline';

export async function GET(req: Request) {
  const admin = await requireAdminRequest(); if (!admin.ok) return admin.response;
  const params = new URL(req.url).searchParams;
  if (params.get('summary') === '1') {
    const sets = await prisma.questionSet.findMany({ include: { questions: true } });
    const mapped = sets.map(s => { const rows = auditContent(s.questions); return { ...s, questions: undefined, questionCount: rows.length, eligibleCount: rows.filter(q => q.review.eligible).length, byDifficulty: Object.fromEntries(DIFFICULTY_TIERS.map(t => [t.value, rows.filter(q => q.difficulty === t.value).length])) }; });
    return NextResponse.json({ sets: mapped, totalQuestions: mapped.reduce((n, s) => n + s.questionCount, 0) });
  }
  const setId = params.get('setId'); if (!setId) return NextResponse.json({ error: 'setId required' }, { status: 400 });
  const rows = await prisma.mCQQuestion.findMany({ where: { setId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  const questions = auditContent(rows);
  const importIssues = await prisma.questionImportIssue.findMany({ where: { setId }, orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ questions, questionCount: rows.length, eligibleCount: questions.filter(q => q.review.eligible).length, importIssues, tiers: DIFFICULTY_TIERS });
}
export async function POST(req: Request) {
  const admin = await requireAdminRequest(); if (!admin.ok) return admin.response;
  try {
    const body = await req.json(); const setId = String(body.setId || '');
    if (!await prisma.questionSet.findUnique({ where: { id: setId } })) return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    const incoming = Array.isArray(body.questions) ? body.questions : [body];
    const report = await prisma.$transaction(async tx => {
      const existing = await tx.mCQQuestion.findMany({ where: { setId } });
      const seen = new Set(existing.map(contentSignature)); let order = Math.max(-1, ...existing.map(q => q.sortOrder)) + 1;
      const report = { inserted: 0, skippedDuplicates: 0, quarantined: 0, issues: [] as any[] };
      for (let i = 0; i < incoming.length; i++) {
        const raw = incoming[i]; let reason = '';
        try {
          const payload = authorQuestion(raw, order++); const signature = contentSignature(payload);
          if (seen.has(signature)) { reason = 'Duplicate question (same prompt, choices and answer)'; report.skippedDuplicates++; }
          else { await tx.mCQQuestion.create({ data: { ...payload, setId } as any }); seen.add(signature); report.inserted++; }
        } catch (e: any) { reason = e.message; report.quarantined++; }
        if (reason) { await tx.questionImportIssue.create({ data: { setId, rowIndex: i + 1, reason, payload: raw ?? {} } }); report.issues.push({ row: i + 1, reason }); }
      }
      return report;
    }, {timeout:60000,maxWait:10000});
    return NextResponse.json(report);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
export async function DELETE(req: Request) {
  const admin = await requireAdminRequest(); if (!admin.ok) return admin.response;
  const body = await req.json();
  const ids = body.ids || [body.id];
  if (!body.setId && !ids.filter(Boolean).length) return NextResponse.json({ error: 'Question or pool required' }, { status: 400 });
  const result = await prisma.$transaction(async tx => {
    const rows = await tx.mCQQuestion.findMany({ where: body.clearSet && body.setId ? { setId: body.setId } : { id: { in: ids.filter(Boolean) } } });
    for (const q of rows) await tx.mCQQuestion.update({ where: { id: q.id }, data: { data: { ...(q.data as any || {}), lifecycleStatus: 'ARCHIVED' } } });
    if (body.clearSet && body.setId) { await tx.questionSetPlacement.updateMany({ where: { setId: body.setId }, data: { isActive: false } }); await tx.questionSet.update({ where: { id: body.setId }, data: { status: 'DRAFT' } }); }
    return rows.length;
  }, {timeout:60000,maxWait:10000});
  return NextResponse.json({ ok: true, archived: result, deleted: 0 });
}
export async function PATCH(req: Request) {
  const admin = await requireAdminRequest(); if (!admin.ok) return admin.response;
  try {
    const body = await req.json();
    await prisma.$transaction(async tx => {
      if (body.setId && Array.isArray(body.order)) {
        const rows = await tx.mCQQuestion.findMany({ where: { setId: body.setId } }); const ids = new Set(rows.map(q => q.id));
        if (new Set(body.order).size !== body.order.length || body.order.some((id: string) => !ids.has(id))) throw new Error('Order contains duplicate or foreign question IDs');
        for (let i = 0; i < body.order.length; i++) await tx.mCQQuestion.update({ where: { id: body.order[i] }, data: { sortOrder: i } });
        return;
      }
      const ids = body.ids || [body.id]; const patch = body.patch || body;
      const rows = await tx.mCQQuestion.findMany({ where: { id: { in: ids.filter(Boolean) } } });
      if (!rows.length) throw new Error('Questions not found');
      for (const q of rows) {
        const merged = { ...q, ...patch, data: { ...(q.data as any || {}), ...(patch.data || {}) } };
        if (patch.bossEligible !== undefined) merged.data.bossEligible = Boolean(patch.bossEligible);
        if (patch.lifecycleStatus) merged.data.lifecycleStatus = patch.lifecycleStatus;
        // Archiving/rejection must remain possible even for malformed legacy content.
        if (patch.reviewStatus === 'REJECTED' || patch.lifecycleStatus === 'ARCHIVED') {
          await tx.mCQQuestion.update({ where: { id: q.id }, data: { data: { ...(q.data as any || {}), ...(patch.lifecycleStatus ? { lifecycleStatus: patch.lifecycleStatus } : {}), ...(patch.reviewStatus ? { reviewStatus: patch.reviewStatus } : {}) } } }); continue;
        }
        const normalized = authorQuestion(merged, q.sortOrder);
        const issues = validateContent(merged);
        if (patch.reviewStatus === 'APPROVED' && issues.length) throw new Error(issues.join('; '));
        normalized.data.reviewStatus = patch.reviewStatus === 'APPROVED' ? 'APPROVED' : 'PENDING';
        normalized.data.lifecycleStatus = patch.lifecycleStatus || merged.data.lifecycleStatus || 'ACTIVE';
        await tx.mCQQuestion.update({ where: { id: q.id }, data: normalized as any });
      }
    }, {timeout:60000,maxWait:10000});
    return NextResponse.json({ ok: true });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
