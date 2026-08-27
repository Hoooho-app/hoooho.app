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
    '--hoho-content-compact', '--hoho-content-wide'
  ]) assert.match(tokens, new RegExp(token))
})

test('global UI supports reduced motion and responsive desktop content', async () => {
  const styles = await read('./index.css')
  assert.match(styles, /prefers-reduced-motion/)
  assert.match(styles, /min-width:\s*768px/)
  assert.match(styles, /var\(--hoho-content-compact\)/)
})
