'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '@/lib/useDialogFocus';
import './practice-flow.css';
export default function PracticeDialog({title,children,onClose,tone='neutral'}:{title:string;children:ReactNode;onClose:()=>void;tone?:string}) {
  const [mounted,setMounted]=useState(false);
  useEffect(()=>{setMounted(true);},[]);
  useEffect(()=>{
    if (!mounted) return;
    const previous=document.body.style.overflow;document.body.style.overflow='hidden';
    return()=>{document.body.style.overflow=previous;};
  },[mounted]);
  const ref=useDialogFocus(mounted,onClose);
  if (!mounted) return null;
  return createPortal(<div className="practiceDialogOverlay" onClick={onClose}>
    <div ref={ref} tabIndex={-1} className={`practiceDialog paidAssetPanel ${tone}`} role="dialog" aria-modal="true" aria-label={title} onClick={e=>e.stopPropagation()}>
      <header><h2>{title}</h2><button type="button" className="d2Btn" onClick={onClose} aria-label="Close dialog">Close</button></header>
      {children}
    </div>
  </div>,document.body);
}
