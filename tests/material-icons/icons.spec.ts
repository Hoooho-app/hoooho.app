import { test, expect } from '@playwright/test'

async function variants(icon: ReturnType<import('@playwright/test').Page['locator']>) {
  return icon.evaluate(svg=>({outline:getComputedStyle(svg.querySelector('.hoho-icon__outline')!).display,solid:getComputedStyle(svg.querySelector('.hoho-icon__solid')!).display}))
}
test('all 159 original pairs render at mobile width and explicit state wins',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.goto('/tests/material-icons/fixture.html')
  await expect(page.locator('[data-symbol]')).toHaveCount(159)
  for(const state of [false,true]) {
    const all=await page.locator(`[data-symbol] .hoho-icon[data-icon-selected="${state}"]`).evaluateAll(icons=>icons.map(svg=>({name:svg.getAttribute('data-icon'),box:svg.getBoundingClientRect().width,outline:getComputedStyle(svg.querySelector('.hoho-icon__outline')!).display,solid:getComputedStyle(svg.querySelector('.hoho-icon__solid')!).display,path:svg.querySelector('path')?.getAttribute('d')})))
    expect(all).toHaveLength(159)
    for(const icon of all){expect(icon.box,icon.name!).toBe(24);expect(icon.path?.length,icon.name!).toBeGreaterThan(10);expect(state?icon.outline:icon.solid,icon.name!).toBe('none');expect(state?icon.solid:icon.outline,icon.name!).not.toBe('none')}
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await page.screenshot({path:'test-results/material-icons/pairs-mobile.png',fullPage:true,animations:'disabled'})
})
test('login, navigation and favorite follow real control selection; brands keep identity',async({page})=>{
  await page.goto('/tests/material-icons/fixture.html')
  const password=page.getByRole('button',{name:'password',exact:true}),email=page.getByRole('button',{name:'email',exact:true})
  expect((await variants(password.locator('svg'))).outline).toBe('none')
  await email.click()
  expect((await variants(email.locator('svg'))).outline).toBe('none')
  expect((await variants(password.locator('svg'))).solid).toBe('none')
  const brand=page.getByRole('button',{name:'apple',exact:true}).locator('svg')
  const original=await brand.innerHTML();await page.getByRole('button',{name:'apple',exact:true}).click();expect(await brand.innerHTML()).toBe(original)
  await page.getByRole('button',{name:'profile',exact:true}).click()
  expect((await variants(page.getByRole('button',{name:'profile',exact:true}).locator('svg'))).outline).toBe('none')
  expect((await variants(page.getByRole('button',{name:'calendar',exact:true}).locator('svg'))).solid).toBe('none')
  const favorite=page.getByRole('button',{name:'关注',exact:true});await favorite.click();expect((await variants(favorite.locator('svg'))).outline).toBe('none');await favorite.click();expect((await variants(favorite.locator('svg'))).solid).toBe('none')
})
test('native choices retain checked/keyboard behavior and food names do not acquire false icons',async({page})=>{
  await page.goto('/tests/material-icons/fixture.html')
  const checkbox=page.getByRole('checkbox',{name:'复选框'}),one=page.getByRole('radio',{name:'单选一'}),two=page.getByRole('radio',{name:'单选二'})
  const before=await checkbox.evaluate(e=>getComputedStyle(e).maskImage);await checkbox.check();await expect(checkbox).toBeChecked();expect(await checkbox.evaluate(e=>getComputedStyle(e).maskImage)).not.toBe(before)
  await one.check();await expect(one).toBeChecked();await two.check();await expect(two).toBeChecked();await expect(one).not.toBeChecked()
  await checkbox.focus();await checkbox.press('Space');await expect(checkbox).not.toBeChecked()
  await expect(page.getByRole('region',{name:'记录语义'}).locator('[data-icon]')).toHaveCount(5)
  expect(await page.locator('[aria-label="记录语义"] [data-icon]').evaluateAll(icons=>icons.map(i=>i.getAttribute('data-icon')))).toEqual(['bedtime','stethoscope','lab_research','volunteer_activism','health_cross'])
  await expect(page.locator('[aria-label="食物"] [data-icon="nutrition"]')).toBeVisible()
  await expect(page.getByText('鳕鱼',{exact:true})).toBeVisible()
  await expect(page.locator('[aria-label="食物"] [data-icon="none"] svg')).toHaveCount(0)
})

test('all sixteen food names remain in the real card and its SVG-backed PNG export completes',async({page})=>{
  await page.goto('/tests/material-icons/fixture.html')
  await page.getByText('忌口卡与导出验收',{exact:true}).click()
  const card=page.getByRole('article',{name:'忌口卡正文'})
  await expect(card.locator('.dietary-food-item')).toHaveCount(16)
  await expect(card.locator('.dietary-food-icon .hoho-icon')).toHaveCount(3)
  await expect(card.getByText('番茄',{exact:true})).toBeVisible()
  await expect(card.getByText('螃蟹',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'生成导出图片',exact:true}).click()
  const preview=page.getByRole('img',{name:'导出图片预览'})
  await expect(preview).toBeVisible()
  expect(await preview.evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBe(1200)
  expect(await preview.evaluate((image:HTMLImageElement)=>image.naturalHeight)).toBeGreaterThan(900)
})
