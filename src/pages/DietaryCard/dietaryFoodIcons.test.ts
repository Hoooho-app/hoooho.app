import assert from 'node:assert/strict'
import test from 'node:test'
import { getDietaryFoodIcon, loadDietaryFoodIcon } from './dietaryFoodIcons.ts'
import { foodIconAssets } from './foodIconAssets.ts'

test('16 food icons resolve from stable IDs and keep both small resource sizes', () => {
  assert.equal(Object.keys(foodIconAssets).length, 16)
  for (const foodId of Object.keys(foodIconAssets)) {
    const icon = getDietaryFoodIcon({ foodId, name: 'translated display name' })
    assert.equal(icon?.id, foodId)
    assert.match(icon!.src, new RegExp(`/webp-96/${foodId}\\.[a-f0-9]{10}\\.webp$`))
    assert.match(getDietaryFoodIcon({ foodId, name: '' }, 144)!.src, /webp-144/)
  }
  assert.equal(getDietaryFoodIcon({ foodId: 'lamb-mutton', name: '羊肉' })?.id, 'lamb')
  assert.equal(getDietaryFoodIcon({ foodId: 'cod', name: 'Cod' })?.id, 'fish')
})

test('finite historical aliases and traditional/English labels resolve exactly', () => {
  for (const name of ['番茄', '西红柿', '西紅柿', ' Tomato ']) assert.equal(getDietaryFoodIcon({ name })?.id, 'tomato')
  for (const name of ['橘子', '桔子', 'Orange']) assert.equal(getDietaryFoodIcon({ name })?.id, 'orange')
  for (const name of ['蟹', '螃蟹', 'Crab']) assert.equal(getDietaryFoodIcon({ name })?.id, 'crab')
  assert.equal(getDietaryFoodIcon({ name: '雞蛋' })?.id, 'egg')
  assert.equal(getDietaryFoodIcon({ name: '鳕鱼' })?.id, 'fish')
})

test('unknown food identities never infer dairy, beans or fruit from substrings', () => {
  for (const name of ['火龙果', '牛奶巧克力', '羊奶', '酸奶', '豌豆', '豆类', '牛肉酱', 'constructor', '__proto__']) {
    assert.equal(getDietaryFoodIcon({ name }), null)
  }
  assert.equal(getDietaryFoodIcon({ foodId: 'dragon-fruit', name: 'Apple' }), null)
  assert.equal(getDietaryFoodIcon({ foodId: 'milk', name: 'Milk / 牛奶' })?.id, 'milk')
})

test('image network failure and stalled decode resolve to fallback within one budget', async () => {
  const oldImage = Object.getOwnPropertyDescriptor(globalThis, 'Image')
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  let scenario = 'success'
  class FakeImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    decoding = ''
    set src(value: string) { if (value) queueMicrotask(() => scenario === 'error' ? this.onerror?.() : this.onload?.()) }
    decode() { return scenario === 'stalled' ? new Promise<void>(() => {}) : Promise.resolve() }
  }
  try {
    Object.defineProperty(globalThis, 'Image', { value: FakeImage, configurable: true })
    Object.defineProperty(globalThis, 'window', { value: { setTimeout, clearTimeout }, configurable: true })
    assert.ok(await loadDietaryFoodIcon('/food-icons/test.webp', 20) instanceof FakeImage)
    scenario = 'error'
    assert.equal(await loadDietaryFoodIcon('/food-icons/test.webp', 20), null)
    scenario = 'stalled'
    assert.equal(await loadDietaryFoodIcon('/food-icons/test.webp', 20), null)
  } finally {
    if (oldImage) Object.defineProperty(globalThis, 'Image', oldImage)
    else Reflect.deleteProperty(globalThis, 'Image')
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
