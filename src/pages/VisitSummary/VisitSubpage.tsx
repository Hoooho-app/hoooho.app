import { useEffect, useRef, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'

// Focused full-page editing/export flows use the existing app focus/scroll hooks.
export function VisitSubpage({children,title,label,onClose,action}:{children:ReactNode;title:string;label:string;onClose:()=>void;action?:ReactNode}){
  const ref=useRef<HTMLElement>(null)
  usePageScrollLock(true);useDialogFocus(true,ref)
  useEffect(()=>{const handler=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose()};document.addEventListener('keydown',handler);return()=>document.removeEventListener('keydown',handler)},[onClose])
  return <section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className="visit-subpage"><header><button aria-label={`返回${label}`} onClick={onClose}><ArrowLeft size={20}/><span>取消</span></button><h2>{title}</h2><div>{action}</div></header><div className="visit-subpage-body">{children}</div></section>
}
