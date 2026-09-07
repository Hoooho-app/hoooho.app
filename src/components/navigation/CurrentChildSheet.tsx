import { Check, Circle, Plus, SquarePen, X } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { postAuthRequest } from '../../services/auth'
import { useAppStore } from '../../store/useAppStore'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'
import { Avatar } from '../common'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'
import './current-child-sheet.css'
import { getChildMembers } from '../../features/family/currentChild'

interface CurrentChildSheetProps {
  onClose: () => void
  onEdit: (memberId: string) => void
  onAdd: () => void
  open: boolean
}

const genderLabel = { male: '男', female: '女', undisclosed: '不方便透露', '': '未填写' } as const
const closeThreshold = 72

export function CurrentChildSheet({ onAdd, onClose, onEdit, open }: CurrentChildSheetProps) {
  const sheetRef = useRef<HTMLElement>(null)
  const dragRef = useRef<{ pointerId: number; startY: number } | null>(null)
  const members = useAppStore((state) => state.members)
  const currentMemberId = useAppStore((state) => state.currentMemberId)
  const setCurrentMemberId = useAppStore((state) => state.setCurrentMemberId)
  const children = getChildMembers(members)
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [dragOffset, setDragOffset] = useState(0)
  usePageScrollLock(open)
  useDialogFocus(open, sheetRef)

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose, open])

  useEffect(() => {
    if (open) return
    setError('')
    setSwitchingId(null)
    setDragOffset(0)
  }, [open])

  if (!open) return null

  const switchMember = async (memberId: string) => {
    if (switchingId || memberId === currentMemberId) return
    setSwitchingId(memberId)
    setError('')
    try {
      await postAuthRequest<{ success: true }>('/api/auth/current-member', { memberId })
      setCurrentMemberId(memberId, { sync: false })
      onClose()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '切换失败，请重试')
    } finally {
      setSwitchingId(null)
    }
  }

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = { pointerId: event.pointerId, startY: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setDragOffset(Math.max(0, event.clientY - drag.startY))
  }

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    const shouldClose = dragOffset >= closeThreshold
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (shouldClose) onClose()
    else setDragOffset(0)
  }

  return (
    <div className="current-child-sheet-layer" role="presentation">
      <button aria-label="关闭我的孩子" className="current-child-sheet-backdrop" onClick={onClose} type="button" />
      <section
        aria-label="我的孩子"
        aria-modal="true"
        className="current-child-sheet"
        ref={sheetRef}
        role="dialog"
        style={{ transform: `translateY(${dragOffset}px)` }}
        tabIndex={-1}
      >
        <div
          aria-hidden="true"
          className="current-child-sheet__drag-zone"
          onPointerCancel={finishDrag}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
        >
          <span />
        </div>
        <header className="current-child-sheet__header">
          <h2>我的孩子</h2>
          <button aria-label="关闭我的孩子" onClick={onClose} type="button"><X size={21} strokeWidth={1.8} /></button>
        </header>
        <div className="current-child-sheet__list">
          {children.map((member) => {
            const current = member.id === currentMemberId
            const busy = switchingId === member.id
            return (
              <div className="current-child-sheet__row" data-current={current} key={member.id}>
                <button
                  aria-label={current ? `${member.name}，当前记录对象` : `切换到${member.name}`}
                  className="current-child-sheet__select"
                  disabled={Boolean(switchingId)}
                  onClick={() => current ? onClose() : void switchMember(member.id)}
                  type="button"
                >
                  <span className="current-child-sheet__selection" data-current={current}>
                    {current ? <Check aria-hidden="true" size={18} strokeWidth={2.4} /> : <Circle aria-hidden="true" size={22} strokeWidth={1.8} />}
                  </span>
                  <Avatar name={member.name} src={member.avatar} size="md" />
                  <span className="current-child-sheet__identity">
                    <span className="current-child-sheet__name-line">
                      <strong>{member.name}</strong>
                      {current && <span className="current-child-sheet__current-label">当前记录对象</span>}
                    </span>
                    <span>{genderLabel[member.gender ?? '']} · {member.birthday ? formatAgeFromBirthday(member.birthday) : member.age}</span>
                  </span>
                  {busy && <span className="current-child-sheet__busy" aria-hidden="true" />}
                </button>
                <button
                  aria-label={`编辑${member.name}的资料`}
                  className="current-child-sheet__edit"
                  disabled={Boolean(switchingId)}
                  onClick={(event) => { event.stopPropagation(); onEdit(member.id) }}
                  type="button"
                >
                  <SquarePen aria-hidden="true" size={19} strokeWidth={1.8} />
                </button>
              </div>
            )
          })}
          {children.length === 0 && <p className="current-child-sheet__empty">还没有添加孩子</p>}
          {error && <p className="current-child-sheet__error" role="alert">{error}</p>}
        </div>
        <footer className="current-child-sheet__footer">
          <button type="button" onClick={onAdd}><Plus aria-hidden="true" size={20} strokeWidth={1.9} />添加孩子</button>
        </footer>
      </section>
    </div>
  )
}
