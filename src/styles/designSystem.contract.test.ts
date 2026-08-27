import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (relative: string) => readFile(new URL(relative, import.meta.url), 'utf8')

test('V2 exposes the required design foundations', async () => {
  const tokens = await read('./tokens.css')
  for (const token of [
    '--hoho-color-primary-active', '--hoho-color-primary-border', '--hoho-color-surface-elevated',
    '--hoho-color-info', '--hoho-color-disabled', '--hoho-font-size-data', '--hoho-space-5',
    '--hoho-radius-overlay', '--hoho-motion-fast', '--hoho-motion-base', '--hoho-motion-slow',
    '--hoho-app-shell-max', '--hoho-content-compact', '--hoho-content-wide'
  ]) assert.match(tokens, new RegExp(token))
  assert.match(tokens, /--hoho-color-primary:\s*27 122 110/)
  assert.match(tokens, /--hoho-color-background:\s*245 248 246/)
  assert.match(tokens, /--hoho-color-text-primary:\s*24 49 47/)
  assert.match(tokens, /--hoho-radius-control:\s*12px/)
})

test('product polish keeps shared navigation and grouped rows on one visual system', async () => {
  const styles = await read('./product-polish.css')
  assert.match(styles, /\.profile-directory-group/)
  assert.match(styles, /\.settings-group/)
  assert.match(styles, /\.hoho-drawer\.hoho-drawer/)
  assert.match(styles, /\.health-action-tab/)
  assert.match(styles, /\.event-identity-details/)
})

test('global UI supports reduced motion and responsive desktop content', async () => {
  const tokens = await read('./tokens.css')
  const styles = await read('./index.css')
  assert.match(styles, /prefers-reduced-motion/)
  assert.match(styles, /min-width:\s*768px/)
  assert.match(tokens, /--hoho-app-shell-max:\s*620px/)
  assert.match(styles, /min-width:\s*640px/)
  assert.match(styles, /\.app-shell[^}]*max-width:\s*var\(--hoho-app-shell-max\)/s)
  assert.match(styles, /\.page-content[^}]*width:\s*100%/s)
  assert.match(styles, /health-events-fab[^}]*var\(--hoho-app-shell-max\)/s)
  assert.match(styles, /health-events-filter-layer[^}]*var\(--hoho-app-shell-max\)/s)
  assert.match(styles, /quick-record-trigger,[^}]*quick-record-panel[^}]*width:\s*calc\(var\(--hoho-app-shell-max\)/s)
  assert.match(styles, /health-event-detail-fixed\s*\{[^}]*width:\s*100%[^}]*max-width:\s*var\(--hoho-app-shell-max\)/s)
  assert.match(styles, /health-event-detail \.page-content[^}]*scrollbar-width:\s*none/s)
  assert.doesNotMatch(tokens, /--hoho-font-size-(?:display|page-title):[^;]*vw/)
  assert.doesNotMatch(styles, /\.app-shell[^}]*max-width:\s*var\(--hoho-content-wide\)/s)
})
