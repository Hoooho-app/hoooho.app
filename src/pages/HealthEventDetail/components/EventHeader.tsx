import { Check, ChevronLeft, LoaderCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface EventHeaderProps {
  confirmDisabled?: boolean
  confirming?: boolean
  onConfirm?: () => void
  title?: string
}

export function EventHeader({ confirmDisabled = false, confirming = false, onConfirm, title = '健康事件详情' }: EventHeaderProps) {
  const navigate = useNavigate()

  return (
    <header className={`hoho-page-header sticky top-0 z-20 grid grid-cols-3 items-center px-3 ${onConfirm ? 'min-h-14' : 'min-h-16'}`}>
      <button className="grid h-11 w-11 place-items-center rounded-full hover:bg-primary-soft" type="button" aria-label="返回" onClick={() => navigate(-1)}>
        <ChevronLeft size={23} strokeWidth={1.8} />
      </button>
      <h1 className="hoho-text-section-title whitespace-nowrap text-center">{title}</h1>
      {onConfirm ? <button aria-label="保存记录情况" className="grid h-11 w-11 place-items-center justify-self-end rounded-full text-primary disabled:text-text-weak" disabled={confirmDisabled || confirming} onClick={onConfirm} type="button">{confirming ? <LoaderCircle className="animate-spin" size={22} /> : <Check size={24} strokeWidth={2} />}</button> : <span aria-hidden="true" />}
    </header>
  )
}
