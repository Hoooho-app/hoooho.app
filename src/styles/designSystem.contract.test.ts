import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (relative: string) => readFile(new URL(relative, import.meta.url), 'utf8')

test('V2 exposes the required design foundations', async () => {
  const tokens = await read('./tokens.css')
  const html = await read('../../index.html')
  for (const token of [
    '--hoho-color-primary-active', '--hoho-color-primary-border', '--hoho-color-page-background', '--hoho-color-surface-elevated',
    '--hoho-color-info', '--hoho-color-disabled', '--hoho-font-size-data', '--hoho-space-5',
    '--hoho-radius-overlay', '--hoho-motion-fast', '--hoho-motion-base', '--hoho-motion-slow',
    '--hoho-app-shell-max', '--hoho-content-compact', '--hoho-content-wide'
  ]) assert.match(tokens, new RegExp(token))
  assert.match(tokens, /--hoho-color-primary:\s*72 98 83/)
  assert.match(tokens, /--hoho-color-page-background:\s*244 242 237/)
  assert.match(tokens, /--hoho-color-background:\s*244 242 237/)
  assert.match(tokens, /--hoho-color-text-primary:\s*39 51 50/)
  assert.match(tokens, /--hoho-radius-control:\s*10px/)
  assert.match(html, /name="theme-color" content="#f4f2ed"/)
})

test('global user page foundation uses the clean light canvas and light surfaces', async () => {
  const tokens = await read('./tokens.css')
  const styles = await read('./index.css')
  const polish = await read('./product-polish.css')
  const settings = await read('./settings.css')
  const guide = await read('./guide.css')
  assert.match(tokens, /--hoho-color-page-background:\s*244 242 237/)
  assert.match(tokens, /--hoho-color-background:\s*244 242 237/)
  assert.match(tokens, /--hoho-color-surface:\s*252 251 247/)
  assert.match(styles, /html, body, #root\s*\{[^}]*background:\s*rgb\(var\(--hoho-color-page-background\)\)/s)
  assert.match(styles, /\.app-shell\s*\{[^}]*background:\s*rgb\(var\(--hoho-color-page-background\)\)/s)
  assert.doesNotMatch(polish, /\.app-shell\s*\{[^}]*background:/s)
  assert.doesNotMatch(settings, /\.settings-page\s*\{[^}]*background:/s)
  assert.doesNotMatch(guide, /\.guide-shell\s*\{[^}]*background:/s)
})

test('product polish keeps shared navigation and grouped rows on one visual system', async () => {
  const styles = await read('./product-polish.css')
  assert.match(styles, /\.profile-directory-group/)
  assert.match(styles, /\.settings-group/)
  assert.match(styles, /\.hoho-drawer\.hoho-drawer/)
  assert.match(styles, /\.health-action-tab/)
  assert.match(styles, /\.event-identity-details/)
})

test('short mobile drawers reserve two compact identity rows and let history scroll independently', async () => {
  const styles = await read('../components/navigation/side-drawer-layout.css')
  const drawer = await read('../components/navigation/SideDrawer.tsx')
  assert.equal((drawer.match(/className="drawer-identity-row"/g) ?? []).length, 2)
  assert.match(drawer, /<Avatar[^>]*size="sm"/)
  assert.match(drawer, /'切换记录对象'/)
  assert.doesNotMatch(drawer, />切换人物</)
  assert.doesNotMatch(drawer, />编辑资料</)
  assert.match(styles, /\.drawer-identity-row\{[^}]*min-height:44px/)
  assert.match(styles, /\.drawer-conversations\{[^}]*min-height:0;overflow-y:auto/)
  assert.match(styles, /\.drawer-utilities\{flex:none/)
})

test('global UI supports reduced motion and responsive desktop content', async () => {
  const tokens = await read('./tokens.css')
  const styles = await read('./index.css')
  assert.match(styles, /prefers-reduced-motion/)
  assert.match(styles, /min-width:\s*768px/)
  assert.match(tokens, /--hoho-app-shell-max:\s*620px/)
  assert.match(styles, /min-width:\s*640px/)
  assert.match(styles, /\.app-shell[^}]*max-width:\s*var\(--hoho-app-shell-max\)/s)
  assert.match(styles, /\.app-shell\.app-shell--wide[^}]*max-width:\s*var\(--hoho-content-wide\)/s)
  assert.match(styles, /\.page-content[^}]*width:\s*100%/s)
  assert.match(styles, /health-events-fab[^}]*var\(--hoho-app-shell-max\)/s)
  assert.match(styles, /quick-record-trigger,[^}]*quick-record-panel[^}]*width:\s*calc\(var\(--hoho-app-shell-max\)/s)
  assert.match(styles, /health-event-detail-fixed\s*\{[^}]*width:\s*100%[^}]*max-width:\s*var\(--hoho-app-shell-max\)/s)
  assert.match(styles, /health-event-detail \.page-content[^}]*scrollbar-width:\s*none/s)
  assert.doesNotMatch(tokens, /--hoho-font-size-(?:display|page-title):[^;]*vw/)
})

test('interactive controls keep readable contrast and 44px touch targets', async () => {
  const tokens = await read('./tokens.css')
  const components = await read('./design-system.css')
  const global = await read('./index.css')
  assert.match(tokens, /--hoho-color-text-weak:\s*101 112 104/)
  assert.match(components, /\.hoho-button\[data-size='small'\][^}]*min-height:\s*var\(--hoho-touch-target\)/s)
  assert.match(components, /\.hoho-toggle\s*\{[^}]*height:\s*var\(--hoho-touch-target\)/s)
  assert.match(global, /\.health-events-view-switch button\s*\{[^}]*min-height:\s*var\(--hoho-touch-target\)/s)
})

test('global quality rules cover responsive choices, stable wide headers, and dormant chart controls', async () => {
  const global = await read('./index.css')
  const chart = await read('../pages/HealthEventDetail/components/TemperatureChartSection.tsx')
  const detailContract = await read('../pages/HealthEventDetail/components/HealthEventDetail.contract.test.ts')
  assert.match(global, /\.feedback-categories>div[^}]*repeat\(3,/s)
  assert.match(global, /\.app-shell--wide > \.hoho-main-header > button/)
  assert.match(global, /data-view-mode='triage'/)
  assert.match(chart, /role="button"/)
  assert.match(chart, /tabIndex=\{0\}/)
  assert.match(chart, /temperature-chart-point__hit/)
  assert.match(chart, /r="22"/)
  assert.match(detailContract, /includes\('<TemperatureChartSection'\), false/)
})
