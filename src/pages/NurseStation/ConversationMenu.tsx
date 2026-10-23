import { Info, MoreHorizontal, Share2, SquarePen } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { HohoButton } from '../../components/design-system'
import { useDialogFocus } from '../../hooks/useDialogFocus'

export function ConversationMenu({ onNew, onShare, onAbout, disabled }: { onNew: () => void; onShare: () => void; onAbout: () => void; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const menu = useRef<HTMLElement>(null)
  useDialogFocus(open, menu)
  useEffect(() => {
    if (!open) return
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [open])
  const choose = (action: () => void) => { setOpen(false); action() }
  return <><HohoButton variant="text" size="icon" aria-label="更多操作" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><MoreHorizontal size={23} aria-hidden="true" /></HohoButton>{open && <div className="front-desk-menu-layer" role="dialog" aria-modal="true" aria-label="更多操作"><button className="front-desk-menu-backdrop" aria-label="关闭更多操作" onClick={() => setOpen(false)} /><nav ref={menu} className="front-desk-menu" role="menu" aria-label="对话操作"><button role="menuitem" disabled={disabled} onClick={() => choose(onNew)}><SquarePen size={19} aria-hidden="true" />新建对话</button><button role="menuitem" onClick={() => choose(onShare)}><Share2 size={19} aria-hidden="true" />分享护护</button><button role="menuitem" onClick={() => choose(onAbout)}><Info size={19} aria-hidden="true" />产品介绍</button></nav></div>}</>
}
