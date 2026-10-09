'use client';
import PracticeDialog from './PracticeDialog';
import TechInterviewSimulator from './TechInterviewSimulator';
export default function MockInterviewModal({open,onClose}:{open:boolean;onClose:()=>void}){
  if(!open)return null;
  return <PracticeDialog title="AI Tech Interview" onClose={onClose}><TechInterviewSimulator/></PracticeDialog>;
}
