import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function EventHeader() {
  const navigate = useNavigate()

  return (
    <header className="hoho-page-header sticky top-0 z-20 grid min-h-16 grid-cols-3 items-center px-3">
      <button className="grid h-11 w-11 place-items-center rounded-full hover:bg-primary-soft" type="button" aria-label="返回" onClick={() => navigate(-1)}>
        <ChevronLeft size={23} strokeWidth={1.8} />
      </button>
      <h1 className="hoho-text-section-title whitespace-nowrap text-center">健康事件详情</h1>
      <span aria-hidden="true" />
    </header>
  )
}
