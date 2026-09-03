import { Info } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { HohoButton, ModalSurface, Typography } from '../../../components/design-system'
import { useDialogFocus } from '../../../hooks/useDialogFocus'
import { usePageScrollLock } from '../../../hooks/usePageScrollLock'

interface ComingSoonPromptProps {
  onClose: () => void
  open: boolean
}

export function ComingSoonPrompt({ onClose, open }: ComingSoonPromptProps) {
  const dialogRef = useRef<HTMLElement>(null)
  usePageScrollLock(open)
  useDialogFocus(open, dialogRef)
  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose, open])
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-text-primary/35 px-6" role="presentation">
      <ModalSurface className="p-5 text-center" label="该功能暂未开放" ref={dialogRef} tabIndex={-1}>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary">
          <Info size={23} strokeWidth={1.8} />
        </span>
        <Typography className="mt-4" variant="sectionTitle">该功能暂未开放</Typography>
        <Typography className="mt-2" variant="body">功能正在准备中，后续版本将逐步开放。</Typography>
        <HohoButton className="mt-5" fullWidth onClick={onClose}>知道了</HohoButton>
      </ModalSurface>
    </div>
  )
}
