import type { ReactNode } from 'react'

export function HealthProfileActionBar({ children, split = false }: { children: ReactNode; split?: boolean }) {
  return (
    <div className="health-profile-action-bar">
      <div className={split ? 'grid grid-cols-2 gap-2' : 'grid'}>{children}</div>
    </div>
  )
}
