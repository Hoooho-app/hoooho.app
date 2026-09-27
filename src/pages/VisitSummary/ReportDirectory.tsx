import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'
import type { VisitChapter, VisitChapterId } from '../../types/visitSheet'

// Reuse the application's side-drawer shell and focus/scroll contracts.
export function ReportDirectory({ chapters, active, onClose, onChoose }: {chapters:VisitChapter[];active:VisitChapterId;onClose:()=>void;onChoose:(id:VisitChapterId)=>void}) {
  const ref=useRef<HTMLElement>(null)
  usePageScrollLock(true)
  useDialogFocus(true,ref)
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[onClose])
  return <div className="hoho-drawer-layer visit-directory-layer" role="dialog" aria-modal="true" aria-label="章节目录"><button className="visit-directory-backdrop" aria-label="关闭目录" onClick={onClose}/><aside className="hoho-drawer visit-directory" ref={ref} tabIndex={-1}><header><h2>报告目录</h2><button onClick={onClose} aria-label="关闭章节目录"><X/></button></header><nav data-visit-sheet-index>{chapters.map((c,i)=><button key={c.id} aria-current={active===c.id?'page':undefined} onClick={()=>onChoose(c.id)}><span>{String(i+1).padStart(2,'0')}</span>{c.title}</button>)}</nav></aside></div>
}
