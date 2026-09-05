import { PersonStanding, Baby, Bandage, CircleEllipsis, Cross, FileText, HandHeart, Hospital, Leaf, Moon, Pill, Smile, Syringe, Thermometer, Toilet, Users, Utensils } from 'lucide-react'
import type { JournalCategory } from './timeViewModel'

const icons = { diet: Utensils, sleep: Moon, elimination: Toilet, activity: PersonStanding, emotion: Smile, social: Users, symptom: Cross, measurement: Thermometer, growth: Baby, injury: Bandage, medication: Pill, care: HandHeart, vaccination: Syringe, environment: Leaf, visit: Hospital, examination: FileText, other: CircleEllipsis }
export function JournalCategoryIcon({ category }: { category: JournalCategory }) {
  const Icon = icons[category] ?? CircleEllipsis
  return <Icon aria-hidden="true" className="text-primary shrink-0" size={20} strokeWidth={1.8} />
}
