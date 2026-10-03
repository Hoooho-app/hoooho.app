import path from 'node:path'
import { createRequire } from 'node:module'
import { fail } from './contract.mjs'

const require = createRequire(import.meta.url)
let active = 0

export async function pdfPageImage(dataUrl, signal) {
  signal?.throwIfAborted()
  if (active >= 2) throw fail('资料转图繁忙，请稍后重试，原件未修改', 429, 'AI_PDF_RENDER_BUSY')
  active++
  let loading, document, render
  const boundedSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000)
  const cancel = () => { render?.cancel(); loading?.destroy().catch(() => {}) }
  boundedSignal.addEventListener('abort', cancel, { once: true })
  try {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
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
    active--
  }
}
