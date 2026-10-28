import { expect, type Page } from '@playwright/test'

/** A settled reply may be the next question; it is not necessarily save-ready. */
export async function waitForNurseReply(page:Page){
  if(await page.locator('.smart-record-home').count()){const id=await page.locator('.nurse-turn--user[data-message-id]').last().getAttribute('data-message-id');await expect(page.locator(`.nurse-turn--assistant[data-message-id="${id}:reply"]`)).toBeVisible();return}
  await expect(page.getByLabel('回答当前问题',{exact:true}).or(page.getByRole('button',{name:'核对记录',exact:true}))).toBeVisible()
}

/** Explicit action by the synthetic record owner, never a model identity grant. */
export async function confirmFrontSubject(page:Page){
  const confirm=page.getByRole('button',{name:/^这是.+的记录$/})
  const review=page.getByRole('button',{name:'核对记录',exact:true})
  await expect(confirm.and(page.locator(':enabled')).or(review.and(page.locator(':enabled'))).first()).toBeVisible()
  if(await confirm.count())await confirm.click()
  await expect(review).toBeEnabled()
}

/** Save/edit tests explicitly answer unknown instead of bypassing a live question. */
export async function finishNursingQuestions(page:Page){
  if(await page.locator('.smart-record-home').count()){
    await waitForNurseReply(page)
    const card=page.getByRole('region',{name:'当前记录单'})
    if(await card.isVisible())return
    const lastReply=page.locator('.nurse-turn--assistant[data-message-id]').last()
    if(/[?？]/u.test(await lastReply.innerText())){
      const keyboard=page.getByRole('button',{name:'改用文字',exact:true})
      if(await keyboard.isVisible())await keyboard.click()
      await page.getByRole('textbox',{name:'对话输入'}).fill('不清楚，先按已经说过的情况记录，不再追问。')
      await page.getByRole('button',{name:'发送',exact:true}).click()
      await waitForNurseReply(page)
    }
    const generate=page.getByRole('button',{name:'确认整理',exact:true})
    await expect(generate).toBeEnabled();await generate.click();await expect(card).toBeVisible();return
  }
  await waitForNurseReply(page)
  const question=page.getByLabel('回答当前问题',{exact:true})
  if(await question.count())await question.getByRole('button',{name:'没注意',exact:true}).click()
  // The test actor explicitly confirms the known synthetic record owner through
  // the real UI; selecting a member never supplies factual identity to the model.
  await confirmFrontSubject(page)
}
