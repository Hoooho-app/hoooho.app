export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'manual'

// Start browser APIs in the click handler, before waiting for publication.
// A 192-bit capability is generated locally; the server publishes the reviewed
// snapshot under that token only after the parent's explicit click.
export function newShareToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_')
}

export function presentShareLink(url: string, title: string, published: Promise<unknown>, alreadyPublished: boolean): Promise<ShareOutcome> {
  if (navigator.share) {
    try {
      return navigator.share({ title, url }).then(() => 'shared' as const, e => e?.name === 'AbortError' ? 'cancelled' as const : 'manual' as const)
    } catch { return Promise.resolve('manual') }
  }
  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      // Safari accepts a promise payload, but requires write() itself to run
      // during the gesture. Never copy an unpublished/failed link.
      const value = published.then(() => new Blob([url], { type: 'text/plain' }))
      void value.catch(() => {})
      return navigator.clipboard.write([new ClipboardItem({ 'text/plain': value })]).then(() => 'copied' as const, () => 'manual' as const)
    }
    if (alreadyPublished && navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(url).then(() => 'copied' as const, () => 'manual' as const)
    }
  } catch { /* A readable URL remains available when sharing is blocked. */ }
  return Promise.resolve('manual')
}
