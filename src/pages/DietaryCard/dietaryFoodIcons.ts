import { foodIconAssets } from './foodIconAssets'

export type DietaryFoodIconId = keyof typeof foodIconAssets
export type DietaryFoodIconSize = 96 | 144
export interface DietaryFoodIdentity { foodId?: string; name: string }

// Keep presentation aliases separate from allergy/avoidance classification.
const idIcons: Record<string, DietaryFoodIconId> = { apple: 'apple', milk: 'milk', egg: 'egg' }

const nameIcons: Record<string, DietaryFoodIconId> = {
  苹果: 'apple', 蘋果: 'apple', apple: 'apple', 牛奶: 'milk', 牛乳: 'milk', milk: 'milk', 鸡蛋: 'egg', 雞蛋: 'egg', egg: 'egg'
}

export function getDietaryFoodIcon(food: DietaryFoodIdentity, size: DietaryFoodIconSize = 96): { id: DietaryFoodIconId; src: string } | null {
  const key = food.foodId || food.name.trim().replace(/\s+/g, ' ').toLowerCase()
  const mapping = food.foodId ? idIcons : nameIcons
  const id = Object.hasOwn(mapping, key) ? mapping[key] : undefined
  return id ? { id, src: foodIconAssets[id][size] } : null
}

// Decode has one finite budget including network time; export can always show the complete food name.
export function loadDietaryFoodIcon(src: string, timeoutMs = 5000): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const image = new Image()
    let settled = false
    const finish = (value: HTMLImageElement | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      image.onload = null
      image.onerror = null
      resolve(value)
    }
    const timer = window.setTimeout(() => { finish(null); image.src = '' }, timeoutMs)
    image.decoding = 'async'
    image.onerror = () => finish(null)
    image.onload = () => {
      if (typeof image.decode === 'function') void image.decode().then(() => finish(image)).catch(() => finish(null))
      else finish(image)
    }
    image.src = src
  })
}
