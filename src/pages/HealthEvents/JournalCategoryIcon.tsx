import { PersonStanding, Baby, Bandage, CircleEllipsis, Cross, FileText, HandHeart, Hospital, Leaf, Moon, Pill, Smile, Syringe, Thermometer, Toilet, Users } from 'lucide-react'
import type { JournalCategory } from './timeViewModel'

export function SpoonIcon({ size = 20, strokeWidth = 1.8 }: { size?: number; strokeWidth?: number }) {
  return <svg aria-hidden="true" className="text-primary shrink-0 journal-category-icon--spoon" fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} viewBox="0 0 24 24" width={size}><ellipse cx="7.25" cy="6.75" rx="3.25" ry="4.25" transform="rotate(-42 7.25 6.75)" /><path d="m9.7 9.3 9.8 10.2" /></svg>
}

const icons = { sleep: Moon, elimination: Toilet, activity: PersonStanding, emotion: Smile, social: Users, symptom: Cross, measurement: Thermometer, growth: Baby, injury: Bandage, medication: Pill, care: HandHeart, vaccination: Syringe, environment: Leaf, visit: Hospital, examination: FileText, other: CircleEllipsis }
export function JournalCategoryIcon({ category }: { category: JournalCategory }) {
  if (category === 'diet') return <SpoonIcon />
  const Icon = icons[category] ?? CircleEllipsis
  return <Icon aria-hidden="true" className="text-primary shrink-0" size={20} strokeWidth={1.8} />
}
