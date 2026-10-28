import { MaterialIcon, type MaterialIconName } from '../../components/icons'
import { getDietaryFoodIcon, type DietaryFoodIdentity } from './dietaryFoodIcons'
import type { DietaryCardGroup } from './dietaryCardModel'

const names: Record<string, MaterialIconName> = { apple: 'nutrition', milk: 'local_drink', egg: 'egg' }
export function DietaryFoodIcon({ food }: { food: DietaryFoodIdentity; fallbackName?: string; group: DietaryCardGroup }) {
  const icon = getDietaryFoodIcon(food)
  return <span aria-hidden="true" className="dietary-food-icon" data-icon={icon?.id ?? 'none'} data-empty={!icon || undefined}>
    {icon && <MaterialIcon name={names[icon.id]} size={32}/>}
  </span>
}
