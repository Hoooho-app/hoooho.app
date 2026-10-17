import type { Page } from '@playwright/test'
export async function installQaFont(page: Page) {
  const path = process.env.HOOOHO_QA_CJK_FONT
  if (!path) return
  await page.route('**/__organize-qa-font.otf', route => route.fulfill({ path, contentType: 'font/otf' }))
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style')
    style.textContent = '@font-face{font-family:OrganizeQaCjk;src:url(/__organize-qa-font.otf)}:root{--hoho-font-family:OrganizeQaCjk,sans-serif;--hoho-font-family-heading:OrganizeQaCjk,sans-serif}'
    document.head.append(style)
  }))
}
