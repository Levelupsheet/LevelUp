import { z } from 'zod';
import { beginTechInterview, techSessionUser } from '@/lib/techInterviewSession';
const Body=z.object({role:z.string().trim().min(2).max(160).optional(),industry:z.string().trim().min(2).max(160).optional(),level:z.enum(['Entry level','Intermediate','Senior']).default('Entry level')});
export async function POST(req:Request){const user=await techSessionUser();if(!user)return Response.json({error:'Sign in to save an interview'},{status:401});try{const session=await beginTechInterview(user.id,({...Body.parse(await req.json())} as {role?:string;industry?:string;level:string}));return Response.json({session});}catch(e:any){return Response.json({error:e instanceof z.ZodError?'Choose a valid role and level':e.message},{status:e instanceof z.ZodError?400:503});}}
