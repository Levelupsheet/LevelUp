import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { loadLearningAttempts } from '@/lib/learningHistory';
import { buildLearningInsights } from '@/lib/learningInsights';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Sign in to view your learning insights.' }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const timezone = params.get('timezone') || 'UTC';
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 }); }
  try {
    const [all, sessions] = await Promise.all([
      loadLearningAttempts(user.id),
      prisma.gameSession.findMany({ where: { userId: user.id }, select: { status: true, scopeKey: true } }),
    ]);
    const scopes = [...new Set(all.map(a => a.scopeKey).filter(Boolean))];
    const scope = params.get('scope') || '';
    if (scope && !scopes.includes(scope)) return NextResponse.json({ error: 'Learning scope not found' }, { status: 404 });
    const poolIds = [...new Set(all.map(a => a.setId).filter(Boolean))];
    const pools = poolIds.length ? await prisma.questionSet.findMany({ where: { id: { in: poolIds } }, select: { id: true, name: true } }) : [];
    const poolNames = Object.fromEntries(pools.map(p => [p.id, p.name]));
    return NextResponse.json({ poolNames, ...buildLearningInsights(scope ? all.filter(a => a.scopeKey === scope) : all, scope ? sessions.filter(s => s.scopeKey === scope) : sessions, timezone), scopes }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { console.error('Learning insights failed', error); return NextResponse.json({ error: 'Could not load learning insights. Please retry.' }, { status: 500 }); }
}
