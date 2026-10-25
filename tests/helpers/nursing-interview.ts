import { expect, type Page } from '@playwright/test'

/** A settled reply may be the next question; it is not necessarily save-ready. */
export async function waitForNurseReply(page:Page){
  await expect(page.getByLabel('回答当前问题',{exact:true}).or(page.getByRole('button',{name:'核对记录',exact:true}))).toBeVisible()
}

/** Save/edit tests explicitly answer unknown instead of bypassing a live question. */
export async function finishNursingQuestions(page:Page){
  await waitForNurseReply(page)
  const question=page.getByLabel('回答当前问题',{exact:true})
  if(await question.count())await question.getByRole('button',{name:'没注意',exact:true}).click()
  await expect(page.getByRole('button',{name:'核对记录',exact:true})).toBeEnabled()
}
