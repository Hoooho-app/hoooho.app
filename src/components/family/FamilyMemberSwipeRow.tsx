import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'

const ACTION_WIDTH = 80

interface Props {
  children: ReactNode
  name: string
  onDelete: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
}

interface Drag {
  initialOffset: number
  intent: 'horizontal' | 'pending' | 'vertical'
  pointerId: number
  startX: number
  startY: number
}

export function FamilyMemberSwipeRow({ children, name, onDelete, onOpenChange, open }: Props) {
  const [dragging, setDragging] = useState(false)
  const [offset, setOffset] = useState(open ? -ACTION_WIDTH : 0)
  const dragRef = useRef<Drag | null>(null)
  const suppressClickRef = useRef(false)

  useEffect(() => {
    if (!dragging) setOffset(open ? -ACTION_WIDTH : 0)
  }, [dragging, open])

  const finishDrag = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (cancelled || drag.intent !== 'horizontal') {
      setOffset(open ? -ACTION_WIDTH : 0)
      return
    }
    const nextOffset = Math.max(-ACTION_WIDTH, Math.min(0, drag.initialOffset + event.clientX - drag.startX))
    const shouldOpen = nextOffset <= -(ACTION_WIDTH / 2)
    suppressClickRef.current = Math.abs(event.clientX - drag.startX) > 8
    setOffset(shouldOpen ? -ACTION_WIDTH : 0)
    onOpenChange(shouldOpen)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'Delete') {
      event.preventDefault()
      onOpenChange(true)
    } else if (event.key === 'ArrowRight' || event.key === 'Escape') {
      event.preventDefault()
      onOpenChange(false)
    }
  }

  return <div aria-label={`${name}，向左滑动显示删除操作`} className="family-member-swipe-row" onKeyDown={handleKeyDown} role="group" tabIndex={0}>
    <button aria-hidden={!open} className="family-member-swipe-row__delete" onClick={onDelete} style={{ opacity: offset < 0 ? 1 : 0 }} tabIndex={open ? 0 : -1} type="button">删除</button>
    <div
      className="family-member-swipe-row__content"
      data-dragging={dragging}
      onClickCapture={(event) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false
          event.preventDefault()
          event.stopPropagation()
        } else if (open) {
          event.preventDefault()
          event.stopPropagation()
          onOpenChange(false)
        }
      }}
      onPointerCancel={(event) => finishDrag(event, true)}
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0) return
        dragRef.current = { initialOffset: open ? -ACTION_WIDTH : 0, intent: 'pending', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY }
        setDragging(true)
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId) return
        const deltaX = event.clientX - drag.startX
        const deltaY = event.clientY - drag.startY
        if (drag.intent === 'pending' && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 6) {
          drag.intent = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical'
          if (drag.intent === 'horizontal') event.currentTarget.setPointerCapture(event.pointerId)
        }
        if (drag.intent !== 'horizontal') return
        event.preventDefault()
        setOffset(Math.max(-ACTION_WIDTH, Math.min(0, drag.initialOffset + deltaX)))
      }}
      onPointerUp={(event) => finishDrag(event)}
      style={{ transform: `translate3d(${offset}px, 0, 0)` }}
    >{children}</div>
  </div>
}
