import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function EventHeader() {
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-20 grid min-h-16 grid-cols-3 items-center border-b border-primary/15 bg-surface/95 px-3 shadow-calm backdrop-blur">
      <button className="grid h-11 w-11 place-items-center rounded-full hover:bg-primary-soft" type="button" aria-label="返回" onClick={() => navigate(-1)}>
        <ChevronLeft size={23} strokeWidth={1.8} />
      </button>
      <h1 className="whitespace-nowrap text-center text-lg font-bold text-heading">健康事件详情</h1>
      <span aria-hidden="true" />
    </header>
  )
}
