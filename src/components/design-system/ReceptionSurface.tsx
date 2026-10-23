import type { ReactNode } from 'react'
import { HealthCard } from './HealthCard'
import './ReceptionSurface.css'

/** A shared welcome surface for first use and an ongoing conversation. */
export function ReceptionSurface({ media, kicker, title, description }: { media: ReactNode; kicker: ReactNode; title: ReactNode; description?: ReactNode }) {
  return <HealthCard className="hoho-reception" role="region" aria-label="护护接待区">
    <div className="hoho-reception__media">{media}</div>
    <div className="hoho-reception__copy"><p className="hoho-reception__kicker">{kicker}</p><h2>{title}</h2>{description && <p className="hoho-reception__description">{description}</p>}</div>
  </HealthCard>
}
