export type GuestBankProgress = { seen:string[]; missed:string[]; domains:Record<string,{correct:number;total:number}>; xp:number; sessions:number; lastDay:string; streak:number };
export const emptyGuestProgress=():GuestBankProgress=>({seen:[],missed:[],domains:{},xp:0,sessions:0,lastDay:'',streak:0});
export function recordGuestAnswer(progress:GuestBankProgress,id:string,domain:string,correct:boolean) {
  const current=progress.domains[domain] || {correct:0,total:0};
  return {...progress,seen:[...new Set([...progress.seen,id])].slice(-10000),missed:correct?progress.missed.filter(q=>q!==id):[...new Set([...progress.missed,id])].slice(-10000),domains:{...progress.domains,[domain]:{correct:current.correct+Number(correct),total:current.total+1}}};
}
export function readGuestProgress(key:string):GuestBankProgress {
  try { const value=JSON.parse(localStorage.getItem('lu_guest_practice_v1:'+key) || 'null');
    if (value && Array.isArray(value.seen) && Array.isArray(value.missed) && value.domains && typeof value.domains==='object') return {...emptyGuestProgress(),...value};
  } catch {}
  return emptyGuestProgress();
}
export function saveGuestProgress(key:string,value:GuestBankProgress) {
  try {localStorage.setItem('lu_guest_practice_v1:'+key,JSON.stringify(value));return true;} catch {return false;}
}
export function finishGuestPractice(progress:GuestBankProgress,xp:number,now=new Date()) {
  const day=`${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
  const yesterday=new Date(now);yesterday.setDate(now.getDate()-1);
  const prior=`${yesterday.getFullYear()}-${yesterday.getMonth()+1}-${yesterday.getDate()}`;
  return {...progress,xp:progress.xp+Math.max(0,xp),sessions:progress.sessions+1,lastDay:day,streak:progress.lastDay===day?progress.streak:progress.lastDay===prior?progress.streak+1:1};
}
