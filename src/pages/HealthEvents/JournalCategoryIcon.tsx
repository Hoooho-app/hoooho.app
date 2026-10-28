import { MaterialIcon, type IconProps, type MaterialIconName } from '../../components/icons'
import type { DietRecordKind } from '../../types/journal'
import type { JournalCategory } from './timeViewModel'

export function SpoonIcon(props: IconProps) { return <MaterialIcon {...props} name="rice_bowl" /> }
export function FeedingBottleIcon(props: IconProps) { return <MaterialIcon {...props} name="pediatrics" /> }
export function SupplementBottleIcon(props: IconProps) { return <MaterialIcon {...props} name="medication_liquid" /> }

const dietIcons: Record<DietRecordKind, MaterialIconName> = {
  feeding: 'pediatrics', complementary: 'rice_bowl', meal: 'soup_kitchen', snack: 'nutrition', supplement: 'medication_liquid'
}
export function JournalDietIcon({ kind, ...props }: IconProps & { kind?: DietRecordKind }) {
  return <MaterialIcon size={20} className="text-primary shrink-0" {...props} name={dietIcons[kind ?? 'complementary']} />
}
const icons: Partial<Record<JournalCategory, MaterialIconName>> = {
  sleep: 'bedtime', elimination: 'gastroenterology', activity: 'person', emotion: 'sentiment_satisfied', social: 'group',
  symptom: 'add_box', measurement: 'thermometer', growth: 'child_care', injury: 'healing', medication: 'pill',
  care: 'volunteer_activism', vaccination: 'syringe', environment: 'eco', visit: 'stethoscope', examination: 'lab_research', other: 'pending'
}
export function JournalCategoryIcon({ category, dietKind, ...props }: IconProps & { category: JournalCategory; dietKind?: DietRecordKind }) {
  if (category === 'diet') return <JournalDietIcon kind={dietKind} {...props}/>
  return <MaterialIcon size={20} className="text-primary shrink-0" {...props} name={icons[category] ?? 'pending'} />
}
