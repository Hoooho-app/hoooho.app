import { useEffect } from 'react'

// Browser chrome and the native status-bar surround belong to the visible page,
// including welcome slides and account theme changes, rather than a fixed white shell.
export function PageAppearanceEffects() {
  useEffect(() => {
    let frame = 0
    let previous = ''
    const update = () => {
      frame = 0
      const edge = document.elementFromPoint(Math.floor(innerWidth / 2), 1)
      const layers: number[][] = []
      for (let node = edge; node; node = node.parentElement) {
        const value = getComputedStyle(node).backgroundColor
        const match = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(value)
        if (match) {
          layers.push([...match.slice(1, 4).map(Number), Number(match[4] ?? 1)])
          if (layers.at(-1)![3] === 1) break
        }
      }
      if (!layers.length) return
      const channels = layers.reverse().reduce((base, layer) => base.map((value, index) =>
        value * (1 - layer[3]) + layer[index] * layer[3]), [244, 242, 237])
      const color = `#${channels.map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('')}`
      if (color === previous) return
      previous = color
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      if (meta) meta.content = color
      const native = window as Window & { hooohoNativeAppearance?: (color: string) => void }
      native.hooohoNativeAppearance?.(color)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    const observer = new MutationObserver(schedule)
    observer.observe(document.documentElement, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ['class', 'style', 'data-care-theme', 'data-tone'],
    })
    window.addEventListener('resize', schedule)
    window.addEventListener('pageshow', schedule)
    document.addEventListener('transitionend', schedule)
    schedule()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('pageshow', schedule)
      document.removeEventListener('transitionend', schedule)
    }
  }, [])
  return null
}
