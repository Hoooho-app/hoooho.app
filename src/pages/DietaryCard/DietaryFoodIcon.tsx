import { useState } from 'react'
import { getDietaryFoodIcon, type DietaryFoodIdentity } from './dietaryFoodIcons'
import type { DietaryCardGroup } from './dietaryCardModel'

export function DietaryFoodIcon({ food, fallbackName = food.name, group }: {
  food: DietaryFoodIdentity; fallbackName?: string; group: DietaryCardGroup
}) {
  const icon = getDietaryFoodIcon(food)
  const [failedSrc, setFailedSrc] = useState('')
  const [loadedSrc, setLoadedSrc] = useState('')
  const src = icon?.src
  const loaded = src && loadedSrc === src && failedSrc !== src
  return <span aria-hidden="true" className="dietary-food-icon" data-icon={icon?.id ?? 'fallback'}>
    {!loaded && <span className="dietary-food-glyph" data-group={group}>{fallbackName.trim().slice(0, 1)}</span>}
    {src && failedSrc !== src && <img alt="" decoding="async" height={40} width={40} src={src}
      onLoad={() => setLoadedSrc(src)} onError={() => setFailedSrc(src)} style={{ opacity: loaded ? 1 : 0 }} />}
  </span>
}
