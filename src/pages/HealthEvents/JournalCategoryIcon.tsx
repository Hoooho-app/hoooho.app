import { Apple, CookingPot, PersonStanding, Baby, Bandage, CircleEllipsis, Cross, FileText, HandHeart, Hospital, Leaf, Moon, Pill, Smile, Syringe, Thermometer, Toilet, Users } from 'lucide-react'
import type { DietRecordKind } from '../../types/journal'
import type { JournalCategory } from './timeViewModel'

export function SpoonIcon({ size = 20, strokeWidth = 1.8 }: { size?: number; strokeWidth?: number }) {
  return <svg aria-hidden="true" className="text-primary shrink-0 journal-category-icon--spoon" fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} viewBox="0 0 24 24" width={size}><ellipse cx="7.25" cy="6.75" rx="3.25" ry="4.25" transform="rotate(-42 7.25 6.75)" /><path d="m9.7 9.3 9.8 10.2" /></svg>
}

export function FeedingBottleIcon({ size = 20, strokeWidth = 1.8 }: { size?: number; strokeWidth?: number }) {
  return <svg aria-hidden="true" className="text-primary shrink-0 diet-type-icon--feeding-bottle" fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} viewBox="0 0 24 24" width={size}><path d="M10 2h4v3l2 3v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8l2-3V2Z" /><path d="M9 9h6M9 15h3" /></svg>
}

export function SupplementBottleIcon({ size = 20, strokeWidth = 1.8 }: { size?: number; strokeWidth?: number }) {
  return <svg aria-hidden="true" className="text-primary shrink-0 diet-type-icon--supplement-bottle" fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} viewBox="0 0 24 24" width={size}><path d="M9 2h6v3H9zM10 5v2.2L8 9v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9l-2-1.8V5" /><path d="M8 11h8M10 15h4M12 13v4" /></svg>
}

export function JournalDietIcon({ kind, size = 20, strokeWidth = 1.8 }: { kind?: DietRecordKind; size?: number; strokeWidth?: number }) {
  if (kind === 'feeding') return <FeedingBottleIcon size={size} strokeWidth={strokeWidth} />
  if (kind === 'meal') return <CookingPot aria-hidden="true" className="text-primary shrink-0 diet-type-icon--meal-pot" size={size} strokeWidth={strokeWidth} />
  if (kind === 'snack') return <Apple aria-hidden="true" className="text-primary shrink-0 diet-type-icon--snack-apple" size={size} strokeWidth={strokeWidth} />
  if (kind === 'supplement') return <SupplementBottleIcon size={size} strokeWidth={strokeWidth} />
  return <SpoonIcon size={size} strokeWidth={strokeWidth} />
}

const icons = { sleep: Moon, elimination: Toilet, activity: PersonStanding, emotion: Smile, social: Users, symptom: Cross, measurement: Thermometer, growth: Baby, injury: Bandage, medication: Pill, care: HandHeart, vaccination: Syringe, environment: Leaf, visit: Hospital, examination: FileText, other: CircleEllipsis }
export function JournalCategoryIcon({ category, dietKind }: { category: JournalCategory; dietKind?: DietRecordKind }) {
  if (category === 'diet') return <JournalDietIcon kind={dietKind} />
  const Icon = icons[category] ?? CircleEllipsis
  return <Icon aria-hidden="true" className="text-primary shrink-0" size={20} strokeWidth={1.8} />
}
