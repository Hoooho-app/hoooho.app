import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const outputDirectory = path.resolve(process.argv[2] || path.join(repositoryRoot, '.codex-tmp/guide-browser-validation'))
const baseUrl = process.env.GUIDE_BASE_URL || 'http://127.0.0.1:4177'
const bootstrapPath = process.env.GUIDE_BOOTSTRAP_PATH
const storageStatePath = process.env.GUIDE_STORAGE_STATE
const playwrightModule = process.env.PLAYWRIGHT_PATH || 'playwright'
const chromePath = process.env.CHROME_PATH
const { chromium } = await import(playwrightModule)
await mkdir(outputDirectory, { recursive: true })

const browser = await chromium.launch({
  executablePath: chromePath || undefined,
  headless: true,
  args: ['--disable-gpu', '--disable-gpu-compositing', '--in-process-gpu']
})

let storageState = storageStatePath
if (bootstrapPath) {
  const authContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const authPage = await authContext.newPage()
  await authPage.goto(`${baseUrl}${bootstrapPath}`, { waitUntil: 'domcontentloaded' })
  await authPage.waitForURL('**/guide', { timeout: 10_000 })
  await authPage.getByRole('heading', { name: '使用说明', exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
  storageState = await authContext.storageState()
  await authContext.close()
}

const results = []
for (const viewport of [
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
  { name: 'desktop', width: 1280, height: 900 }
]) {
  const context = await browser.newContext({ ...(storageState ? { storageState } : {}), viewport: { width: viewport.width, height: viewport.height } })
  const page = await context.newPage()
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(`${baseUrl}/guide`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: '使用说明', exact: true }).waitFor({ state: 'visible' })
  await page.screenshot({ path: path.join(outputDirectory, `guide-${viewport.name}.png`), fullPage: false })
  const state = await page.evaluate(() => ({
    heading: document.querySelector('h2')?.textContent,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    mediaCount: document.querySelectorAll('.guide-media').length,
    scenarioCount: document.querySelectorAll('.guide-scenarios button').length
  }))
  results.push({ ...viewport, ...state, consoleErrors, pageErrors })
  await context.close()
}

const reducedContext = await browser.newContext({ reducedMotion: 'reduce', ...(storageState ? { storageState } : {}), viewport: { width: 375, height: 667 } })
const reducedPage = await reducedContext.newPage()
await reducedPage.goto(`${baseUrl}/guide`, { waitUntil: 'networkidle' })
await reducedPage.getByRole('heading', { name: '使用说明', exact: true }).waitFor({ state: 'visible' })
results.push({
  name: 'reduced-motion',
  posterCount: await reducedPage.locator('.guide-media[data-reduced-motion="true"] img').count(),
  videoCount: await reducedPage.locator('.guide-media video').count(),
  noticeVisible: await reducedPage.getByText('已按系统设置减少动态效果', { exact: true }).first().isVisible()
})
await reducedContext.close()

const failureContext = await browser.newContext({ ...(storageState ? { storageState } : {}), viewport: { width: 375, height: 667 } })
const failurePage = await failureContext.newPage()
await failurePage.route('**/tutorials/recordings/create-event.webm', (route) => route.abort())
await failurePage.goto(`${baseUrl}/guide`, { waitUntil: 'networkidle' })
await failurePage.getByRole('heading', { name: '使用说明', exact: true }).waitFor({ state: 'visible' })
results.push({
  name: 'media-failure',
  failedMediaCount: await failurePage.locator('.guide-media[data-failed="true"]').count(),
  posterVisible: await failurePage.getByRole('img', { name: '孩子半夜发热，怎么快速记录？操作演示封面', exact: true }).isVisible(),
  noticeVisible: await failurePage.getByText('演示暂时无法加载，请查看步骤', { exact: true }).first().isVisible()
})
await failureContext.close()

await browser.close()
await writeFile(path.join(outputDirectory, 'results.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8')
console.info(JSON.stringify(results, null, 2))
