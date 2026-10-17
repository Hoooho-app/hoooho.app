import path from 'node:path'
import { createRequire } from 'node:module'
import { fail } from './contract.mjs'

const require = createRequire(import.meta.url)
// The default renderer is shared by every job. A waiting page must not turn
// another job's legitimate in-flight render into an OCR failure.
export function createPdfPageImageRenderer({ loadPdf = () => import('pdfjs-dist/legacy/build/pdf.mjs') } = {}) {
  let active = 0
  const waiting = []
  const acquire = signal => {
    signal?.throwIfAborted()
    if (active < 2) { active++; return Promise.resolve() }
    return new Promise((resolve, reject) => {
      const entry = { resolve, cleanup: () => signal?.removeEventListener('abort', cancel) }
      const cancel = () => {
        const index = waiting.indexOf(entry)
        if (index < 0) return
        waiting.splice(index, 1)
        entry.cleanup()
        reject(signal.reason)
      }
      waiting.push(entry)
      signal?.addEventListener('abort', cancel, { once: true })
    })
  }
  const release = () => {
    const next = waiting.shift()
    if (next) { next.cleanup(); next.resolve() }
    else active--
  }
  return async (dataUrl, signal) => {
    await acquire(signal)
    try {
      signal?.throwIfAborted()
      return await renderPdfPage(dataUrl, signal, loadPdf)
    } finally { release() }
  }
}

export const pdfPageImage = createPdfPageImageRenderer()

async function renderPdfPage(dataUrl, signal, loadPdf) {
  let loading, document, render
  const boundedSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000)
  const cancel = () => { render?.cancel(); loading?.destroy().catch(() => {}) }
  boundedSignal.addEventListener('abort', cancel, { once: true })
  try {
    boundedSignal.throwIfAborted()
    const { getDocument } = await loadPdf()
    boundedSignal.throwIfAborted()
    const root = path.dirname(require.resolve('pdfjs-dist/package.json')).replace(/\\/g, '/')
    const bytes = new Uint8Array(Buffer.from(dataUrl.split(',')[1], 'base64'))
    if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw new Error('Invalid PDF size')
    loading = getDocument({ data: bytes, verbosity: 0, isEvalSupported: false, useSystemFonts: false, maxImageSize: 4_000_000,
      cMapUrl: `${root}/cmaps/`, cMapPacked: true, standardFontDataUrl: `${root}/standard_fonts/`, wasmUrl: `${root}/wasm/` })
    document = await loading.promise
    if (document.numPages !== 1) throw new Error('Only prepared single pages allowed')
    const page = await document.getPage(1), original = page.getViewport({ scale: 1 })
    if (!Number.isFinite(original.width) || !Number.isFinite(original.height) || original.width <= 0 || original.height <= 0) throw new Error('Invalid dimensions')
    const scale = Math.min(2, 2000 / Math.max(original.width, original.height))
    const viewport = page.getViewport({ scale })
    const factory = document.canvasFactory, canvas = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height))
    try {
      render = page.render({ canvasContext: canvas.context, viewport, background: 'white' })
      await render.promise; boundedSignal.throwIfAborted()
      const image = canvas.canvas.toBuffer('image/png')
      if (!image.length || image.length > 8 * 1024 * 1024) throw new Error('Oversized rendered page')
      return `data:image/png;base64,${image.toString('base64')}`
    } finally { factory.destroy(canvas); page.cleanup() }
  } catch {
    signal?.throwIfAborted()
    throw fail('PDF 页面无法可靠转为图片或处理超时，请将该页转为清晰图片后上传；未调用模型、未修改原件', 422, 'AI_PDF_RENDER_FAILED')
  } finally {
    boundedSignal.removeEventListener('abort', cancel)
    await (document?.destroy() ?? loading?.destroy())?.catch(() => {})
  }
}
