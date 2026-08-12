import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

interface WebPageHeaderProps {
  title: string
  action?: ReactNode
  fallback?: string
}

export function WebPageHeader({ title, action, fallback }: WebPageHeaderProps) {
  const navigate = useNavigate()

  return (
    <header className="hoho-page-header sticky top-0 z-20 grid h-14 shrink-0 grid-cols-[7rem_1fr_7rem] items-center">
      <button
        className="flex h-14 items-center pl-5 text-text-primary"
        type="button"
        aria-label="返回"
        onClick={() => fallback ? navigate(fallback) : navigate(-1)}
      >
        <ChevronLeft size={23} strokeWidth={1.7} />
      </button>
      <h1 className="hoho-text-section-title whitespace-nowrap text-center">{title}</h1>
      <div className="flex h-14 items-center justify-end pr-4">{action}</div>
    </header>
  )
}
