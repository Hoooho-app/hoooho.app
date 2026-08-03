import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface HeaderProps {
  title: string
  back?: boolean
}

export function Header({ title, back }: HeaderProps) {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-20 grid min-h-14 grid-cols-[2.75rem_1fr_2.75rem] items-center border-b bg-surface/95 px-3 backdrop-blur">
      <div>{back && <button className="grid h-11 w-11 place-items-center rounded-full hover:bg-primary-soft" onClick={() => navigate(-1)} aria-label="返回"><ChevronLeft size={20} /></button>}</div>
      <h1 className="text-center text-lg font-semibold tracking-tight">{title}</h1>
      <div />
    </header>
  )
}
