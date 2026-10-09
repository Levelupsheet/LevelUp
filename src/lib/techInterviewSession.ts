import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth/session';
import { askTechInterviewer, interviewScore, MAX_INTERVIEW_TURNS } from './techInterviewAI';
export function readTechState(summary:string|null) {try{const state=JSON.parse(summary || '{}');return state.simulatorVersion===1?state:null;}catch{return null;}}
export function serializeTechSession(session:any) {
  const state=readTechState(session.summary);
  return {id:session.id,status:session.status,role:state?.role,industry:state?.industry,level:state?.level,nextQuestion:state?.nextQuestion,turn:state?.turn || 0,maxTurns:MAX_INTERVIEW_TURNS,pass:session.pass,scoreAvg:session.scoreAvg,performance:state?.performance || null,transcript:(session.turns || []).map((t:any)=>({speaker:t.speaker,content:t.content,feedback:t.speaker==='CANDIDATE'?t.breakdownJson?.response:null}))};
}
export async function techSessionUser(){const user=await getSessionUser();return user?.id ? user : null;}
export async function beginTechInterview(userId:string,options:{role?:string;industry?:string;level:string}) {
  if(!process.env.OPENAI_API_KEY)throw Error('AI interview is not configured. Set OPENAI_API_KEY on the server.');
  const user=await prisma.user.findUnique({where:{id:userId}});if(!user)throw Error('Account not found');
  return prisma.$transaction<ReturnType<typeof serializeTechSession>>(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`tech-start:${userId}`}))`;
    const active=await tx.interviewSession.findFirst({where:{userId,kind:'TECH',status:'IN_PROGRESS'},orderBy:{startedAt:'desc'},include:{turns:{orderBy:[{turnIndex:'asc'},{createdAt:'asc'}]}}});
    if(active && readTechState(active.summary))return serializeTechSession(active);
    const role=options.role || user.selectedCareerPath || ({CLOUD_ENGINEER:'Cloud Engineer',DESKTOP_TECHNICIAN:'Desktop Technician'} as Record<string,string>)[user.startingPosition || ''] || 'Help Desk Technician';
    const industry=options.industry || user.selectedIndustry || 'Information Technology';
    const opening=await askTechInterviewer({role,industry,level:options.level,opening:true,history:[],turn:0});
    const state={simulatorVersion:1,role,industry,level:options.level,turn:0,nextQuestion:opening.nextQuestion};
    const session=await tx.interviewSession.create({data:{userId,kind:'TECH',status:'IN_PROGRESS',startedAt:new Date(),summary:JSON.stringify(state),turns:{create:{speaker:'INTERVIEWER',content:`${opening.reply}\n\n${opening.nextQuestion}`,turnIndex:0,scoreTotal:0,breakdownJson:{}}}},include:{turns:true}});
    return serializeTechSession(session);
  },{timeout:30000});
}
export async function answerTechInterview(userId:string,input:{sessionId:string;answer:string;requestId:string;expectedTurn:number}) {
  return prisma.$transaction<ReturnType<typeof serializeTechSession>>(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "InterviewSession" WHERE "id" = ${input.sessionId} AND "userId" = ${userId} FOR UPDATE`;
    const session=await tx.interviewSession.findFirst({where:{id:input.sessionId,userId,kind:'TECH'},include:{turns:{orderBy:[{turnIndex:'asc'},{createdAt:'asc'}]}}});
    if(!session)throw Error('Interview not found');
    const previous=session.turns.find((t:any)=>t.speaker==='CANDIDATE' && t.breakdownJson?.requestId===input.requestId);
    if(previous)return serializeTechSession(session);
    const state=readTechState(session.summary);
    if(session.status!=='IN_PROGRESS' || !state || !state.nextQuestion || state.turn>=MAX_INTERVIEW_TURNS)throw Error('Interview is not active');
    if(state.turn!==input.expectedTurn)throw Error('This answer belongs to an earlier question. Refresh the interview before continuing.');
    const reply=await askTechInterviewer({role:state.role,industry:state.industry,level:state.level,turn:state.turn+1,history:[...session.turns.map(t=>({speaker:t.speaker,content:t.content})),{speaker:'CANDIDATE',content:input.answer}]});
    const score=interviewScore(reply.scores);
    await tx.interviewTurn.create({data:{sessionId:session.id,speaker:'CANDIDATE',content:input.answer,turnIndex:state.turn,scoreTotal:score,breakdownJson:{requestId:input.requestId,response:reply}}});
    await tx.interviewTurn.create({data:{sessionId:session.id,speaker:'INTERVIEWER',content:`${reply.reply}${reply.nextQuestion?`\n\n${reply.nextQuestion}`:''}`,turnIndex:state.turn+1,scoreTotal:0,breakdownJson:{}}});
    await tx.interviewSession.update({where:{id:session.id},data:{summary:JSON.stringify({...state,turn:state.turn+1,nextQuestion:reply.nextQuestion})}});
    return serializeTechSession(await tx.interviewSession.findUnique({where:{id:session.id},include:{turns:{orderBy:[{turnIndex:'asc'},{createdAt:'asc'}]}}}));
  },{timeout:30000});
}
export async function finishTechInterview(userId:string,sessionId:string) {
  return prisma.$transaction<ReturnType<typeof serializeTechSession>>(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "InterviewSession" WHERE "id" = ${sessionId} AND "userId" = ${userId} FOR UPDATE`;
    const session=await tx.interviewSession.findFirst({where:{id:sessionId,userId,kind:'TECH'},include:{turns:{orderBy:[{turnIndex:'asc'},{createdAt:'asc'}]}}});
    if(!session)throw Error('Interview not found');
    if(session.status==='FINISHED')return serializeTechSession(session);
    const state=readTechState(session.summary),answers=session.turns.filter(t=>t.speaker==='CANDIDATE');
    if(!state || state.nextQuestion || answers.length!==MAX_INTERVIEW_TURNS)throw Error('Complete all interview questions before requesting the report');
    const average=answers.reduce((sum,t)=>sum+t.scoreTotal,0)/answers.length;
    const feedback=answers.map((t:any)=>t.breakdownJson.response);
    const performance={summary:average>=.68?'You met the practice interview benchmark. Keep reinforcing the weaker criteria.':'Keep practicing the gaps below and try another interview.',strengths:[...new Set(feedback.flatMap(r=>r.strengths))].slice(0,5),improvements:[...new Set(feedback.flatMap(r=>r.improvements))].slice(0,5),criteria:Object.fromEntries(['technical','reasoning','communication','safety'].map(key=>[key,feedback.reduce((sum,r)=>sum+r.scores[key],0)/answers.length]))};
    const updated=await tx.interviewSession.update({where:{id:sessionId},data:{status:'FINISHED',finishedAt:new Date(),pass:average>=.68,scoreAvg:average,summary:JSON.stringify({...state,performance})},include:{turns:{orderBy:[{turnIndex:'asc'},{createdAt:'asc'}]}}});
    await tx.notification.create({data:{userId,type:'HR_INVITE',title:average>=.68?'Tech interview practice complete':'Tech interview coaching ready',body:performance.summary}});
    // AI coaching never mints employment verification badges or sweepstakes rewards.
    return serializeTechSession(updated);
  });
}
