import { expect, type Page } from '@playwright/test'

/** A settled reply may be the next question; it is not necessarily save-ready. */
export async function waitForNurseReply(page:Page){
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
  await waitForNurseReply(page)
  const question=page.getByLabel('回答当前问题',{exact:true})
  if(await question.count())await question.getByRole('button',{name:'没注意',exact:true}).click()
  // The test actor explicitly confirms the known synthetic record owner through
  // the real UI; selecting a member never supplies factual identity to the model.
  await confirmFrontSubject(page)
}
