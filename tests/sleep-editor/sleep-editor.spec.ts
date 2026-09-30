import { expect, test, type Page } from '@playwright/test'
async function open(page: Page, automatic = false) { await page.goto(`/tests/sleep-editor/index.html${automatic ? '?automatic' : ''}`); await expect(page.getByRole('button', { name: '保存记录', exact: true })).toBeVisible() }
async function time(page: Page, endpoint: string, date: string, value: string) {
  await page.locator('.sleep-editor-card').filter({ hasText: endpoint }).click()
  await page.getByLabel(`${endpoint}日期`, { exact: true }).fill(date)
  await page.getByLabel(`${endpoint}时间`, { exact: true }).fill(value)
  await page.locator('.sleep-editor-card').filter({ hasText: endpoint }).click()
}
test('A-F and H-I: dates, colors, AM/PM, rings, change baseline, optional summaries and retry', async ({ page }) => {
  await open(page)
  await expect(page.locator('.sleep-editor-ring')).toContainText('入睡 · PM')
  expect(await page.locator('.sleep-editor-ring text.sleep-ring-label').allTextContents()).toEqual(['12:00','03:00','06:00','09:00'])
  for (const [sDate,sTime,eDate,eTime,duration,startColor,endColor,arcs] of [
    ['2026-09-30','21:10','2026-10-01','06:00','8小时50分钟','#669AC7','#E7953B',1],
    ['2026-09-30','21:10','2026-10-01','03:00','5小时50分钟','#669AC7','#669AC7',1],
    ['2026-09-30','13:00','2026-09-30','14:30','1小时30分钟','#E7953B','#E7953B',1],
    ['2026-09-30','17:30','2026-09-30','19:00','1小时30分钟','#E7953B','#669AC7',1],
    ['2026-09-30','13:00','2026-10-01','13:00','24小时','#E7953B','#E7953B',2],
    ['2026-09-30','13:00','2026-10-02','01:00','36小时','#E7953B','#669AC7',3]
  ] as const) {
    await time(page,'入睡',sDate,sTime); await time(page,'醒来',eDate,eTime)
    await expect(page.locator('.sleep-ring-duration')).toHaveText(duration)
    expect(await page.locator('.sleep-editor-card').first().evaluate(el=> (el as HTMLElement).style.getPropertyValue('--sleep-accent'))).toBe(startColor)
    expect(await page.locator('.sleep-editor-card').last().evaluate(el=> (el as HTMLElement).style.getPropertyValue('--sleep-accent'))).toBe(endColor)
    await expect(page.locator('.sleep-editor-arc')).toHaveCount(arcs)
    if (duration === '24小时') { await expect(page.locator('.sleep-editor-ring')).toContainText('2圈 · 24小时'); const positions = await page.locator('.sleep-editor-node').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('transform'))); expect(positions[0]).not.toBe(positions[1]); await page.screenshot({ path: 'outputs/sleep-editor/sleep-24h-iphone-se.png' }) }
  }
  for (const [value,color] of [['05:59','#669AC7'],['06:00','#E7953B'],['17:59','#E7953B'],['18:00','#669AC7']]) { await time(page,'醒来','2026-10-01',value); expect(await page.locator('.sleep-editor-card').last().evaluate(el=>(el as HTMLElement).style.getPropertyValue('--sleep-accent'))).toBe(color) }
  await time(page,'入睡','2026-09-30','13:00'); await time(page,'醒来','2026-09-30','14:30')
  await expect(page.getByText('已调整', {exact:true})).toHaveCount(0)
  await time(page,'醒来','2026-10-01','14:30'); await expect(page.getByText('已调整',{exact:true})).toHaveCount(1)
  await expect(page.locator('.sleep-ring-duration')).toHaveText('25小时30分钟')
  await page.getByRole('button',{name:'这段睡眠怎么样？（选填）'}).click(); await page.getByRole('button',{name:'睡得安稳',exact:true}).click(); await page.getByRole('button',{name:'这段睡眠怎么样？（选填）'}).click()
  await page.getByRole('button',{name:'有没有影响睡眠的情况？（选填）'}).click(); await page.getByRole('button',{name:'其他',exact:true}).click(); await page.getByLabel('其他影响睡眠的情况').fill('环境变化'); await page.getByRole('button',{name:'有没有影响睡眠的情况？（选填）'}).click()
  await page.getByLabel('已实际醒来').uncheck()
  await page.evaluate(()=>sessionStorage.setItem('fail','1'))
  await page.getByRole('button',{name:'保存记录',exact:true}).click(); await expect(page.getByRole('alert')).toHaveText('保存失败，请重试')
  await expect(page.locator('.sleep-ring-duration')).toHaveText('25小时30分钟')
  await page.getByRole('button',{name:'保存记录',exact:true}).click(); await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByText('已调整',{exact:true})).toHaveCount(0)
  const saved = await page.evaluate(()=>JSON.parse(sessionStorage.getItem('saved')!)); expect(saved).toMatchObject({quality:'睡得安稳',observations:['其他'],otherNote:'环境变化',status:'ongoing',durationMinutes:1530})
})
test('G,J: actual pointer gestures retain two turns and reverse across sessions and after numeric input', async ({ page }) => {
  await open(page)
  const gesture = async (turns: number) => {
    const ring = await page.locator('.sleep-editor-ring').boundingBox(); const angle0 = (75-90)*Math.PI/180
    await page.mouse.move(ring!.x+ring!.width*(130+Math.cos(angle0)*96)/260,ring!.y+ring!.height*(130+Math.sin(angle0)*96)/260); await page.mouse.down()
    for(let step=1;step<=Math.abs(turns)*72;step++) { const angle=(75+Math.sign(turns)*step*5-90)*Math.PI/180; await page.mouse.move(ring!.x+ring!.width*(130+Math.cos(angle)*96)/260,ring!.y+ring!.height*(130+Math.sin(angle)*96)/260) }
    await page.mouse.up()
  }
  await gesture(2); await expect(page.locator('.sleep-ring-duration')).toHaveText('25小时30分钟'); await expect(page.locator('.sleep-editor-card').last()).toContainText('2026-10-01')
  await gesture(-2); await expect(page.locator('.sleep-ring-duration')).toHaveText('1小时30分钟')
  await time(page,'醒来','2026-10-01','14:30'); await gesture(-1); await expect(page.locator('.sleep-ring-duration')).toHaveText('13小时30分钟')
})
test('375,390,430: manual and automatic collapsed forms accessible, skip and reopen', async ({ page }) => {
  for (const width of [375,390,430]) {
    await page.setViewportSize({width,height:667}); await open(page)
    await expect(page.getByRole('button',{name:'保存记录',exact:true})).toBeInViewport()
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await open(page,true)
    await expect(page.getByRole('button',{name:'本次未发生',exact:true})).toBeInViewport()
    expect(await page.locator('.sleep-editor-node circle').first().evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(44)
    await page.screenshot({path:`outputs/sleep-editor/sleep-sheet-${width}.png`})
    await page.getByRole('button',{name:'本次未发生',exact:true}).click(); await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button',{name:'重新打开'}).click(); await expect(page.locator('.sleep-editor-ring')).toContainText('入睡 · PM')
  }
})

test('AM/PM boundaries, invalid range preserves input and overlapping endpoints remain keyboard-operable', async ({ page }) => {
  await open(page)
  for (const [date,value,period] of [['2026-09-30','11:59','AM'],['2026-09-30','12:00','PM'],['2026-09-30','23:59','PM'],['2026-10-01','00:00','AM']]) { await time(page,'醒来',date,value); await expect(page.locator('.sleep-editor-ring')).toContainText(`醒来 · ${period}`) }
  await time(page,'醒来','2026-09-30','12:00'); await expect(page.getByRole('button',{name:'保存记录',exact:true})).toBeDisabled(); await expect(page.getByRole('alert')).toContainText('晚于入睡')
  await time(page,'醒来','2026-10-01','13:00')
  await page.locator('.sleep-editor-node').first().press('ArrowRight'); await expect(page.locator('.sleep-ring-duration')).toHaveText('23小时59分钟')
  await page.locator('.sleep-editor-node').last().press('ArrowRight'); await expect(page.locator('.sleep-ring-duration')).toHaveText('24小时')
})
