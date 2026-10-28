import type { ReactNode } from 'react'
import { HealthCard } from './HealthCard'
import './ReceptionSurface.css'

/** A shared welcome surface for first use and an ongoing conversation. */
export function ReceptionSurface({ media, kicker, title, description, layout='row' }: { media: ReactNode; kicker?: ReactNode; title: ReactNode; description?: ReactNode; layout?:'row'|'stacked' }) {
  return <HealthCard className={`hoho-reception${layout==='stacked'?' hoho-reception--stacked':''}`} role="region" aria-label="护护接待区">
    <div className="hoho-reception__media">{media}</div>
    <div className="hoho-reception__copy">{kicker&&<p className="hoho-reception__kicker">{kicker}</p>}<h2>{title}</h2>{description && <p className="hoho-reception__description">{description}</p>}</div>
  </HealthCard>
}
