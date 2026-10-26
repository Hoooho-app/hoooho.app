import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { prepareDocuments as prepareDocumentsDefault } from './business/documents.mjs'
import { normalizePhoto as normalizePhotoDefault } from '../food-label/service.mjs'
import { pdfPageImage as pdfPageImageDefault } from './business/pdf-page-image.mjs'

const maxBytes = 15 * 1024 * 1024
const maxFiles = 12
const maxPages = 12
const clone = value => structuredClone(value)
const failure = (message, code, status = 413) => Object.assign(new Error(message), { code, status })
const hash = file => createHash('sha256').update(`${file?.mimeType ?? ''}\0${file?.dataUrl ?? ''}`).digest('hex')
const sourceId = (file, index, inputHash) => typeof (file?.id ?? file?.assetId) === 'string' && (file.id ?? file.assetId).length > 0 && (file.id ?? file.assetId).length <= 180 ? file.id ?? file.assetId : `input-${index + 1}-${inputHash.slice(0, 24)}`
const fileName = file => String(file?.name || '资料').replace(/[\\/\x00-\x1f]/gu, '').slice(0, 120)
const byteSize = file => {
  const data = typeof file?.dataUrl === 'string' ? file.dataUrl : ''
  const comma = data.indexOf(',')
  return comma >= 0 ? Buffer.from(data.slice(comma + 1), 'base64').length : Buffer.byteLength(data)
}
const isHEIC = file => /^image\/hei[cf]$/iu.test(file?.mimeType ?? '')
const supported = file => /^(?:application\/pdf|image\/(?:jpeg|png|webp|heic|heif))$/u.test(file?.mimeType ?? '')
const original = (file, sourceInputId, index) => ({ id: sourceInputId, sourceInputId, inputIndex: index, name: fileName(file), mimeType: file?.mimeType ?? '', dataUrl: file?.dataUrl, lastModified: file?.lastModified ?? 0 })

function problem(entry, stage, code, message, page) {
  return { sourceInputId: entry.sourceInputId, inputIndex: entry.inputIndex, name: entry.name, status: 'failed', stage, code, message, ...(page ? { page } : {}) }
}

/**
 * Prepare each actual input independently. The caller owns `cache` (the prior
 * result's entries), including original bytes; this module has no global cache.
 * Successful documents/pages are reused. `retryFileIds` optionally limits retry
 * to selected failed files; a PDF retry rerenders only its failed pages.
 */
export async function prepareFrontDeskMedia(files = [], options = {}) {
  if (!Array.isArray(files) || files.length > maxFiles) throw failure('一次最多上传12份原件', 'FRONT_MEDIA_FILE_LIMIT')
  if (files.reduce((total, file) => total + byteSize(file), 0) > maxBytes) throw failure('原件总大小不能超过15 MB', 'FRONT_MEDIA_TOTAL_LIMIT')
  const prepare = options.prepareDocuments ?? prepareDocumentsDefault
  const convert = options.normalizePhoto ?? normalizePhotoDefault
  const render = options.pdfPageImage ?? pdfPageImageDefault
  const cache = new Map((Array.isArray(options.cache) ? options.cache : []).map(entry => [`${entry.sourceInputId}:${entry.inputHash}`, entry]))
  const selected = options.retryFileIds ? new Set(options.retryFileIds) : null
  const entries = [], documents = [], pages = [], problems = [], originalFiles = []
  let allocatedPages = 0

  for (let index = 0; index < files.length; index++) {
    options.signal?.throwIfAborted()
    const file = files[index], inputHash = hash(file), sourceInputId = sourceId(file, index, inputHash)
    const cached = cache.get(`${sourceInputId}:${inputHash}`)
    let entry = cached ? clone(cached) : { sourceInputId, inputHash, status: 'failed', problems: [], pageResults: [] }
    entry.inputIndex = index; entry.name = fileName(file)
    const retry = !cached || cached.status !== 'prepared' && (!selected || selected.has(sourceInputId))
    if (retry) {
      entry.problems = []
      try {
        if (!supported(file) || typeof file.dataUrl !== 'string' || !file.dataUrl.startsWith(`data:${file.mimeType};base64,`)) throw failure('资料格式无法读取', 'FRONT_MEDIA_UNSUPPORTED', 415)
        if (!entry.document) {
          let input = file
          if (isHEIC(file)) {
            try {
              const converted = await convert(file)
              options.signal?.throwIfAborted()
              input = { ...file, mimeType: 'image/jpeg', name: fileName(file).replace(/\.hei[cf]$/iu, '.jpg'), dataUrl: converted.dataUrl }
            } catch (error) {
              options.signal?.throwIfAborted()
              if (error?.name === 'AbortError') throw error
              entry.problems.push(problem(entry, 'conversion', 'FRONT_IMAGE_CONVERSION_FAILED', 'HEIC/HEIF图片转换失败，原图已保留，可转换为JPG后重试。'))
              throw error
            }
          }
          const prepared = await prepare([input])
          options.signal?.throwIfAborted()
          if (!prepared.documents?.length || !prepared.pages?.length) throw failure('资料没有可读取页面', 'FRONT_MEDIA_EMPTY', 422)
          const documentId = prepared.documents[0].id
          entry.document = { ...prepared.documents[0], id: documentId, sourceInputId, inputIndex: index, lastModified: file.lastModified ?? 0, ...(isHEIC(file) ? { originalMimeType: file.mimeType } : {}) }
          entry.pageResults = prepared.pages.map(page => ({ status: 'pending', page: { ...page, id: documentId, sourceInputId, inputIndex: index } }))
        }
        if (allocatedPages + entry.pageResults.length > maxPages) {
          entry.problems.push(problem(entry, 'limit', 'FRONT_MEDIA_PAGE_LIMIT', '本批超过12页，请将这份资料单独分批处理；未标记为识别完成。'))
          entry.status = 'failed'
        } else {
          for (const result of entry.pageResults) {
            if (result.status === 'prepared') continue
            options.signal?.throwIfAborted()
            try {
              const imageDataUrl = result.page.mimeType === 'application/pdf' ? await render(result.page.dataUrl, options.signal) : result.page.dataUrl
              options.signal?.throwIfAborted()
              if (typeof imageDataUrl !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/u.test(imageDataUrl)) throw new Error('Renderer returned no usable image')
              // metadata() accepts some truncated image headers. Force pixel
              // decoding here so one broken image cannot break a later collage.
              await sharp(Buffer.from(imageDataUrl.split(',')[1], 'base64'), { limitInputPixels: 40_000_000 }).resize({ width: 32, height: 32, fit: 'inside', withoutEnlargement: true }).raw().toBuffer()
              options.signal?.throwIfAborted()
              result.page.imageDataUrl = imageDataUrl; result.status = 'prepared'; delete result.problem
            } catch (error) {
              options.signal?.throwIfAborted()
              if (error?.name === 'AbortError') throw error
              result.status = 'failed'
              result.problem = result.page.mimeType === 'application/pdf' ? problem(entry, 'render', 'FRONT_PDF_RENDER_FAILED', `PDF第${result.page.page}页处理失败，原件已保留，可重试该页。`, result.page.page) : problem(entry, 'decode', 'FRONT_IMAGE_DECODE_FAILED', '图片无法完整解码，原图已保留，可重新选择。')
            }
          }
          entry.problems.push(...entry.pageResults.filter(result => result.status === 'failed').map(result => result.problem))
          entry.status = entry.pageResults.every(result => result.status === 'prepared') ? 'prepared' : entry.pageResults.some(result => result.status === 'prepared') ? 'partial' : 'failed'
        }
      } catch (error) {
        options.signal?.throwIfAborted()
        if (error?.name === 'AbortError') throw error
        entry.status = 'failed'
        if (!entry.problems.length) {
          const pdf = file?.mimeType === 'application/pdf'
          entry.problems.push(problem(entry, 'preparation', error.code === 'FRONT_MEDIA_UNSUPPORTED' ? error.code : pdf ? 'FRONT_PDF_PREPARATION_FAILED' : 'FRONT_IMAGE_DECODE_FAILED', error.code === 'FRONT_MEDIA_UNSUPPORTED' ? '资料格式无法读取，原件已保留。' : pdf ? 'PDF无法读取或已加密，原件已保留。' : '图片无法解码或格式不匹配，原图已保留。'))
        }
      }
    }
    if (entry.document) {
      entry.document.inputIndex = index; entry.document.lastModified = file?.lastModified ?? 0
      entry.document.name = isHEIC(file) ? entry.name.replace(/\.hei[cf]$/iu, '.jpg') : entry.name
      for (const result of entry.pageResults) { result.page.inputIndex = index; result.page.name = entry.document.name }
    }
    entry.problems = entry.problems.map(item => ({ ...item, inputIndex: index, name: entry.name }))
    for (const result of entry.pageResults) if (result.problem) result.problem = { ...result.problem, inputIndex: index, name: entry.name }
    // Recheck cached entries against this call's complete page budget too.
    if (entry.status !== 'failed' && allocatedPages + entry.pageResults.length > maxPages) {
      entry.status = 'failed'
      entry.problems = [problem(entry, 'limit', 'FRONT_MEDIA_PAGE_LIMIT', '本批超过12页，请将这份资料单独分批处理；未标记为识别完成。')]
    }
    if (entry.status !== 'failed') {
      allocatedPages += entry.pageResults.length
      documents.push(clone(entry.document))
      pages.push(...entry.pageResults.filter(result => result.status === 'prepared').map(result => clone(result.page)))
    }
    if (isHEIC(file) || entry.status !== 'prepared') originalFiles.push(original(file, sourceInputId, index))
    problems.push(...entry.problems)
    entries.push(entry)
  }
  options.signal?.throwIfAborted()
  return { documents, pages, originalFiles, problems, entries }
}
