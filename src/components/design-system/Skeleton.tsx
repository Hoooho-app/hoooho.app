import type { CSSProperties } from 'react'

export function Skeleton({ className = '', height, width }: { className?: string; height?: CSSProperties['height']; width?: CSSProperties['width'] }) {
  return <span aria-hidden="true" className={`hoho-skeleton block ${className}`} style={{ height, width }} />
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return <div aria-busy="true" aria-label="正在加载" className="grid gap-3">
    {Array.from({ length: rows }, (_, index) => <div className="hoho-health-card grid grid-cols-[44px_minmax(0,1fr)] gap-3" key={index}>
      <Skeleton className="rounded-full" height={44} width={44} />
      <div className="grid content-center gap-2"><Skeleton height={14} width="42%" /><Skeleton height={11} width="76%" /></div>
    </div>)}
  </div>
}
