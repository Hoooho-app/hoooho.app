import { Activity, Brain, BicepsFlexed, ChevronRight, Cross, FileText, Footprints, Hand, HeartPulse, Pill, Stethoscope, TestTube, Waypoints, PersonStanding } from 'lucide-react'
import type { HealthEventCardIconKind, HealthEventCardIconPresentation } from '../../types'

interface HealthEventCardIconProps {
  presentation: HealthEventCardIconPresentation
}

const iconComponents: Partial<Record<HealthEventCardIconKind, typeof Activity>> = {
  head: Brain,
  chest: HeartPulse,
  arm: BicepsFlexed,
  hand: Hand,
  foot: Footprints,
  combined: Waypoints,
  medication: Pill,
  examination: TestTube,
  visit: Stethoscope,
  surgery: Cross,
  report: FileText,
  general: Activity
}

const markedBodyLocations = new Set<HealthEventCardIconKind>(['neck', 'abdomen', 'waist', 'leg'])

export function HealthEventCardIcon({ presentation }: HealthEventCardIconProps) {
  if (markedBodyLocations.has(presentation.kind)) {
    return (
      <span aria-hidden="true" className="health-event-card-icon health-event-card-icon--body" data-location={presentation.kind} title={presentation.label}>
        <PersonStanding size={26} strokeWidth={1.65} />
        <span className="health-event-card-icon__marker" />
      </span>
    )
  }

  const Icon = iconComponents[presentation.kind] ?? Activity
  return (
    <span aria-hidden="true" className="health-event-card-icon" title={presentation.label}>
      <Icon size={25} strokeWidth={1.7} />
    </span>
  )
}

export const HealthEventCardChevron = ChevronRight
