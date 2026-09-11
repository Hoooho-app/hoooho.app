import { Baby, Bandage, CircleEllipsis, FileText, HandHeart, Leaf, Smile, Thermometer, Users } from 'lucide-react'
import { HooohoIcon } from '../../components/design-system'
import type { DietRecordKind } from '../../types/journal'
import type { JournalCategory } from './timeViewModel'

export function SpoonIcon({ size = 20, strokeWidth = 1.8 }: { size?: number; strokeWidth?: number }) {
  return <HooohoIcon aria-hidden="true" className="text-primary journal-category-icon--spoon" name="solid-food" size={size === 20 ? 20 : 24} strokeWidth={strokeWidth} />
}

export function FeedingBottleIcon({ size = 20, strokeWidth = 1.8 }: { size?: number; strokeWidth?: number }) {
  return <HooohoIcon aria-hidden="true" className="text-primary diet-type-icon--feeding-bottle" name="feeding" size={size === 20 ? 20 : 24} strokeWidth={strokeWidth} />
}

export function SupplementBottleIcon({ size = 20, strokeWidth = 1.8 }: { size?: number; strokeWidth?: number }) {
  return <HooohoIcon aria-hidden="true" className="text-primary diet-type-icon--supplement-bottle" name="supplement" size={size === 20 ? 20 : 24} strokeWidth={strokeWidth} />
}

export function JournalDietIcon({ kind, size = 20, strokeWidth = 1.8 }: { kind?: DietRecordKind; size?: number; strokeWidth?: number }) {
  if (kind === 'feeding') return <FeedingBottleIcon size={size} strokeWidth={strokeWidth} />
  if (kind === 'meal') return <HooohoIcon aria-hidden="true" className="text-primary diet-type-icon--meal-pot" name="meal" size={size === 20 ? 20 : 24} strokeWidth={strokeWidth} />
  if (kind === 'snack') return <HooohoIcon aria-hidden="true" className="text-primary diet-type-icon--snack-apple" name="snack" size={size === 20 ? 20 : 24} strokeWidth={strokeWidth} />
  if (kind === 'supplement') return <SupplementBottleIcon size={size} strokeWidth={strokeWidth} />
  return <SpoonIcon size={size} strokeWidth={strokeWidth} />
}

const hooohoIcons = { sleep: 'sleep', elimination: 'bowel-movement', activity: 'activity', symptom: 'symptom', medication: 'medication', vaccination: 'vaccine', visit: 'medical-visit' } as const
const legacyIcons = { emotion: Smile, social: Users, measurement: Thermometer, growth: Baby, injury: Bandage, care: HandHeart, environment: Leaf, examination: FileText, other: CircleEllipsis }
export function JournalCategoryIcon({ category, dietKind }: { category: JournalCategory; dietKind?: DietRecordKind }) {
  if (category === 'diet') return <JournalDietIcon kind={dietKind} />
  const hooohoName = hooohoIcons[category as keyof typeof hooohoIcons]
  if (hooohoName) return <HooohoIcon aria-hidden="true" className="text-primary" name={hooohoName} size={20} />
  const Icon = legacyIcons[category as keyof typeof legacyIcons] ?? CircleEllipsis
  return <Icon aria-hidden="true" className="text-primary shrink-0" size={20} strokeWidth={1.8} />
}
