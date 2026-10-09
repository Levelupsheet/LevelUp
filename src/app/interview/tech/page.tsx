import Link from 'next/link';
import TechInterviewSimulator from '@/components/TechInterviewSimulator';
export default function TechInterviewPage(){return <main className="techInterviewPage"><Link href="/dashboard">← Dashboard</Link><h1>AI Tech Interview</h1><TechInterviewSimulator/></main>;}
