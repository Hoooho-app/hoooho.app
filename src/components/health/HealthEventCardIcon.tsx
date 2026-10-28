import { MaterialIcon, ChevronRight, type MaterialIconName } from '../icons'
import type { HealthEventCardIconKind, HealthEventCardIconPresentation } from '../../types'

const icons: Partial<Record<HealthEventCardIconKind, MaterialIconName>> = {
  medication: 'pill', examination: 'lab_research', visit: 'stethoscope', surgery: 'medical_services', report: 'description', general: 'pulse_alert'
}
export function HealthEventCardIcon({ presentation }: { presentation: HealthEventCardIconPresentation }) {
  return <span aria-hidden="true" className="health-event-card-icon" title={presentation.label}>
    <MaterialIcon name={icons[presentation.kind] ?? 'person'} size={24}/>
  </span>
}
export const HealthEventCardChevron = ChevronRight
