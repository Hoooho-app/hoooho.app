import type { VisitSheet } from '../../types/visitSheet'
import { visitIdentity } from './clinicalPresentation'
import './visitIdentity.css'

export function VisitIdentityCard({ report }: { report: VisitSheet }) {
  return <dl className="visit-clinical-identity" aria-label="孩子基本信息">
    {visitIdentity(report).map(field => (
      <div key={field.label}>
        <dt>{field.label}</dt>
        <dd>{field.value || '—'}</dd>
      </div>
    ))}
  </dl>
}
