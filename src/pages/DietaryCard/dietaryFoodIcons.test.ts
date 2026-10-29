import assert from 'node:assert/strict'
import test from 'node:test'
import { getDietaryFoodIcon, loadDietaryFoodIcon } from './dietaryFoodIcons.ts'
import { foodIconAssets } from './foodIconAssets.ts'

test('only the three accurate Material foods resolve and the page/export share one SVG', () => {
  assert.equal(Object.keys(foodIconAssets).length, 3)
  for (const foodId of Object.keys(foodIconAssets)) {
    const icon = getDietaryFoodIcon({ foodId, name: 'translated display name' })
    assert.equal(icon?.id, foodId)
    assert.match(icon!.src, /\/icons\/material-v3\/[^/]+\.svg$/)
    assert.equal(getDietaryFoodIcon({ foodId, name: '' }, 144)!.src, icon!.src)
  }
  for (const foodId of ['orange','banana','peanut','soy','wheat','fish','shrimp','crab','beef','lamb','carrot','broccoli','tomato','lamb-mutton','cod']) {
    assert.equal(getDietaryFoodIcon({ foodId, name: 'Apple' }), null, `${foodId} must keep its own name instead of borrowing an apple icon`)
  }
})

test('finite historical aliases and traditional/English labels resolve exactly', () => {
  for (const name of ['苹果', '蘋果', ' Apple ']) assert.equal(getDietaryFoodIcon({ name })?.id, 'apple')
  for (const name of ['牛奶', '牛乳', 'Milk']) assert.equal(getDietaryFoodIcon({ name })?.id, 'milk')
  assert.equal(getDietaryFoodIcon({ name: '雞蛋' })?.id, 'egg')
  for (const name of ['鳕鱼','番茄','西红柿','西紅柿',' Tomato ','橘子','Orange','蟹','螃蟹','Crab']) assert.equal(getDietaryFoodIcon({ name }), null)
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
