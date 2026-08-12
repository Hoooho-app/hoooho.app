import { Menu } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { SideDrawer } from './SideDrawer'

export function MainAppHeader({ title, action }: { title: string; action?: ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <header className="hoho-page-header grid h-16 shrink-0 grid-cols-3 items-center px-3">
        <button className="grid h-11 w-11 place-items-center rounded-full hover:bg-primary-soft" type="button" aria-label="打开菜单" onClick={() => setOpen(true)}>
          <Menu size={24} strokeWidth={1.8} />
        </button>
        <h1 className="hoho-text-section-title text-center">{title}</h1>
        <div className="justify-self-end">{action}</div>
      </header>
      <SideDrawer open={open} onClose={() => setOpen(false)} />
    </>
  )
}
