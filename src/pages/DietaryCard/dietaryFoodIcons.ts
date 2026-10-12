import { foodIconAssets } from './foodIconAssets'

export type DietaryFoodIconId = keyof typeof foodIconAssets
export type DietaryFoodIconSize = 96 | 144
export interface DietaryFoodIdentity { foodId?: string; name: string }

// Keep presentation aliases separate from allergy/avoidance classification.
const idIcons: Record<string, DietaryFoodIconId> = {
  orange: 'orange', apple: 'apple', banana: 'banana', milk: 'milk', egg: 'egg',
  peanut: 'peanut', soy: 'soy', wheat: 'wheat', fish: 'fish', shrimp: 'shrimp',
  crab: 'crab', beef: 'beef', 'lamb-mutton': 'lamb', lamb: 'lamb',
  carrot: 'carrot', broccoli: 'broccoli', tomato: 'tomato',
  // The established cod ID denotes a specific fish; no fuzzy species matching.
  cod: 'fish'
}

const nameIcons: Record<string, DietaryFoodIconId> = {
  橘子: 'orange', 桔子: 'orange', orange: 'orange', 苹果: 'apple', 蘋果: 'apple', apple: 'apple',
  香蕉: 'banana', banana: 'banana', 牛奶: 'milk', 牛乳: 'milk', milk: 'milk',
  鸡蛋: 'egg', 雞蛋: 'egg', egg: 'egg', 花生: 'peanut', peanut: 'peanut',
  大豆: 'soy', soy: 'soy', 小麦: 'wheat', 小麥: 'wheat', wheat: 'wheat',
  鱼: 'fish', 魚: 'fish', 鱼类: 'fish', 魚類: 'fish', fish: 'fish', 鳕鱼: 'fish', 鱈魚: 'fish', cod: 'fish',
  虾: 'shrimp', 蝦: 'shrimp', shrimp: 'shrimp', 蟹: 'crab', 螃蟹: 'crab', crab: 'crab',
  牛肉: 'beef', beef: 'beef', 羊肉: 'lamb', lamb: 'lamb',
  胡萝卜: 'carrot', 胡蘿蔔: 'carrot', carrot: 'carrot', 西兰花: 'broccoli', 西蘭花: 'broccoli', broccoli: 'broccoli',
  番茄: 'tomato', 西红柿: 'tomato', 西紅柿: 'tomato', tomato: 'tomato'
}

export function getDietaryFoodIcon(food: DietaryFoodIdentity, size: DietaryFoodIconSize = 96): { id: DietaryFoodIconId; src: string } | null {
  const key = food.foodId || food.name.trim().replace(/\s+/g, ' ').toLowerCase()
  const mapping = food.foodId ? idIcons : nameIcons
  const id = Object.hasOwn(mapping, key) ? mapping[key] : undefined
  return id ? { id, src: foodIconAssets[id][size] } : null
}

// Decode has one finite budget including network time; export can always use a glyph.
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
