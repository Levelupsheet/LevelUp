import { prisma } from '@/lib/prisma';
import { summarizeLearning, type LearningAttempt } from '@/lib/learningEngine';
export async function loadLearningAttempts(userId?: string | null, options: { scopeKey?: string; questionIds?: string[] } = {}, db: any = prisma): Promise<LearningAttempt[]> {
  if (!userId) return [];
  const rows = await db.gameSessionQuestion.findMany({ where: { answered: true, ...(options.questionIds ? { questionId: { in: options.questionIds } } : {}), session: { userId, ...(options.scopeKey ? { OR: [{scopeKey:options.scopeKey},{scopeKey:null}] } : {}) } }, include: { session: { select: { id:true,scopeKey:true,industry:true,careerPath:true } } }, orderBy: { answeredAt:'asc' } });
  return rows.filter((q: any) => q.answeredAt && q.isCorrect !== null).map((q:any) => { const p=q.payloadJson || {}; return { questionId:q.questionId || p.id, sessionId:q.sessionId, setId:p.setId, scopeKey:q.session.scopeKey, industry:q.session.industry,careerPath:q.session.careerPath,domain:p.domainId || p.data?.domainId || 'general',subdomain:p.subdomain || p.data?.subdomain || 'general',type:String(p.type || 'multiple_choice').toLowerCase(),difficulty:p.difficulty || p.level || 1,correct:q.isCorrect,score:Number(q.selectedAnswer?.score ?? (q.isCorrect ? 1 : 0)),answeredAt:q.answeredAt.toISOString() }; });
}
export async function loadLearningContext(userId?: string | null, options: {scopeKey?:string;questionIds?:string[]} = {}, db:any = prisma) { return summarizeLearning(await loadLearningAttempts(userId,options,db)); }
