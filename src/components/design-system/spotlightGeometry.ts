export interface GuideRect { left: number; top: number; width: number; height: number }
export interface GuideViewport extends GuideRect {}
export function spotlightLayout(rects: GuideRect[], viewport: GuideViewport, panelHeight: number) {
  const gap = 12, gutter = 12
  const clipped = rects.map(rect => {
    const left = Math.max(viewport.left, rect.left - 6), top = Math.max(viewport.top, rect.top - 6)
    const right = Math.min(viewport.left + viewport.width, rect.left + rect.width + 6), bottom = Math.min(viewport.top + viewport.height, rect.top + rect.height + 6)
    return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
  }).filter(rect => rect.width > 0 && rect.height > 0)
  // Merge overlapping targets: even-odd holes must never cancel each other out.
  const holes: GuideRect[] = []
  for (const source of clipped) {
    let merged = source, index = 0
    while (index < holes.length) {
      const other = holes[index]
      if (merged.left <= other.left + other.width && other.left <= merged.left + merged.width && merged.top <= other.top + other.height && other.top <= merged.top + merged.height) {
        const left = Math.min(merged.left, other.left), top = Math.min(merged.top, other.top)
        merged = { left, top, width: Math.max(merged.left + merged.width, other.left + other.width) - left, height: Math.max(merged.top + merged.height, other.top + other.height) - top }
        holes.splice(index, 1); index = 0
      } else index++
    }
    holes.push(merged)
  }
  const width = Math.min(336, Math.max(1, viewport.width - gutter * 2)), first = holes[0]
  const left = first ? Math.max(viewport.left + gutter, Math.min(first.left + first.width / 2 - width / 2, viewport.left + viewport.width - width - gutter)) : viewport.left + (viewport.width - width) / 2
  const edges = holes.map(hole => ({ top:hole.top, bottom:hole.top + hole.height })).sort((a,b) => a.top - b.top)
  const free: Array<{top:number;bottom:number}> = []
  let edge = viewport.top + gutter
  for (const rect of edges) { if (rect.top - gap > edge) free.push({ top:edge, bottom:rect.top - gap }); edge = Math.max(edge, rect.bottom + gap) }
  if (viewport.top + viewport.height - gutter > edge) free.push({ top:edge, bottom:viewport.top + viewport.height - gutter })
  const available = free.filter(rect => rect.bottom - rect.top >= panelHeight)
  const after = available.find(rect => rect.top >= (first?.top ?? 0) + (first?.height ?? 0))
  const chosen = after ?? available.at(-1)
  const top = chosen ? after ? chosen.top : chosen.bottom - panelHeight : Math.max(viewport.top + gutter, viewport.top + viewport.height - gutter - panelHeight)
  return { holes, panel: { left, top, width, height: panelHeight }, fits: Boolean(chosen) || !holes.length, placement: after ? 'below' : 'above' }
}
export function spotlightPath(width: number, height: number, holes: GuideRect[]) {
  return 'M0 0H' + width + 'V' + height + 'H0Z ' + holes.map(r => 'M' + r.left + ' ' + r.top + 'v' + r.height + 'h' + r.width + 'v-' + r.height + 'Z').join(' ')
}
