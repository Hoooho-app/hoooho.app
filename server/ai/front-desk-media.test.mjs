import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import { prepareDocuments } from './business/documents.mjs'
import { prepareFrontDeskMedia } from './front-desk-media.mjs'

const photo = async (id = 'asset-image', color = '#126a5a') => ({ id, name: `${id}.png`, mimeType: 'image/png', dataUrl: `data:image/png;base64,${(await sharp({ create: { width: 16, height: 12, channels: 3, background: color } }).png().toBuffer()).toString('base64')}`, lastModified: 123 })
const pdf = async (count = 2, id = 'asset-pdf') => {
  const document = await PDFDocument.create()
  for (let index = 0; index < count; index++) document.addPage([80, 100 + index])
  return { id, name: `${id}.pdf`, mimeType: 'application/pdf', dataUrl: `data:application/pdf;base64,${Buffer.from(await document.save()).toString('base64')}` }
}
const heic = id => ({ id, name: `${id}.heic`, mimeType: 'image/heic', dataUrl: `data:image/heic;base64,${Buffer.from(`explicit-invalid-heic-${id}`).toString('base64')}` })
const jpegData = async () => `data:image/jpeg;base64,${(await sharp({ create: { width: 12, height: 10, channels: 3, background: '#fff' } }).jpeg().toBuffer()).toString('base64')}`

test('real PNG decoding and PDF rendering retain stable file-hash IDs and original upload identity separately', async () => {
  const files = [await photo(), await pdf()], expected = await prepareDocuments(files)
  const result = await prepareFrontDeskMedia(files)
  assert.equal(result.problems.length, 0)
  assert.equal(result.documents.length, 2)
  assert.equal(result.pages.length, 3)
  assert.deepEqual(result.documents.map(document => document.id), expected.documents.map(document => document.id))
  assert.deepEqual(result.pages.map(page => [page.id, page.page]), expected.pages.map(page => [page.id, page.page]))
  assert.equal(result.documents[0].sourceInputId, files[0].id)
  assert.notEqual(result.documents[0].id, files[0].id)
  assert.equal(result.documents[0].lastModified, 123)
  for (const page of result.pages) {
    assert.match(page.imageDataUrl, /^data:image\//u)
    const metadata = await sharp(Buffer.from(page.imageDataUrl.split(',')[1], 'base64')).metadata()
    assert.ok(metadata.width > 0 && metadata.height > 0)
  }
  assert.deepEqual(result.originalFiles, [])
})

test('one failed HEIC conversion does not prevent a valid sibling image from being prepared', async () => {
  const good = await photo(), bad = heic('asset-bad')
  const result = await prepareFrontDeskMedia([bad, good])
  assert.equal(result.documents.length, 1)
  assert.equal(result.documents[0].sourceInputId, good.id)
  assert.equal(result.pages.length, 1)
  assert.equal(result.problems.length, 1)
  assert.equal(result.problems[0].sourceInputId, bad.id)
  assert.equal(result.problems[0].code, 'FRONT_IMAGE_CONVERSION_FAILED')
  assert.equal(result.problems[0].inputIndex, 0)
  assert.equal(result.originalFiles[0].dataUrl, bad.dataUrl)
  assert.equal(result.entries[1].status, 'prepared')
})

test('all failed inputs return their specific problems and originals without any placeholder image', async () => {
  const badImage = { id: 'image', name: 'bad.png', mimeType: 'image/png', dataUrl: `data:image/png;base64,${Buffer.from('broken image').toString('base64')}` }
  const badPdf = { id: 'pdf', name: 'bad.pdf', mimeType: 'application/pdf', dataUrl: `data:application/pdf;base64,${Buffer.from('broken PDF').toString('base64')}` }
  const badFormat = { id: 'gif', name: 'unsupported.gif', mimeType: 'image/gif', dataUrl: 'data:image/gif;base64,R0lGODlh' }
  const files = [heic('heic'), badImage, badPdf, badFormat]
  const result = await prepareFrontDeskMedia(files)
  assert.deepEqual(result.documents, [])
  assert.deepEqual(result.pages, [])
  assert.deepEqual(result.problems.map(problem => problem.code), ['FRONT_IMAGE_CONVERSION_FAILED', 'FRONT_IMAGE_DECODE_FAILED', 'FRONT_PDF_PREPARATION_FAILED', 'FRONT_MEDIA_UNSUPPORTED'])
  assert.deepEqual(result.originalFiles.map(file => file.dataUrl), files.map(file => file.dataUrl))
  assert.ok(result.entries.every(entry => entry.status === 'failed'))
})

test('a corrupt pixel stream accepted by metadata is isolated before collage construction', async () => {
  const good = await photo(), bytes = Buffer.from(good.dataUrl.split(',')[1], 'base64')
  bytes[bytes.indexOf(Buffer.from('IDAT')) + 4] = 255
  const bad = { id: 'pixel-corruption', name: 'broken-pixels.png', mimeType: 'image/png', dataUrl: `data:image/png;base64,${bytes.toString('base64')}` }
  assert.equal((await prepareDocuments([bad])).pages.length, 1)
  const result = await prepareFrontDeskMedia([bad, good])
  assert.equal(result.pages.length, 1)
  assert.equal(result.pages[0].sourceInputId, good.id)
  assert.equal(result.problems[0].code, 'FRONT_IMAGE_DECODE_FAILED')
  assert.equal(result.problems[0].stage, 'decode')
  assert.equal(result.originalFiles[0].dataUrl, bad.dataUrl)
})

test('the caller cache reuses successful preparation and retries only the failed conversion', async () => {
  const good = await photo(), bad = heic('retry-heic'), jpeg = await jpegData()
  let goodPreparations = 0, badPreparations = 0, conversions = 0, repaired = false
  const options = {
    prepareDocuments: async files => { if (files[0].id === good.id) goodPreparations++; else badPreparations++; return prepareDocuments(files) },
    normalizePhoto: async () => { conversions++; if (!repaired) throw new Error('Explicit local conversion failure'); return { dataUrl: jpeg } }
  }
  const first = await prepareFrontDeskMedia([good, bad], options)
  repaired = true
  const next = await prepareFrontDeskMedia([good, bad], { ...options, cache: first.entries, retryFileIds: [bad.id] })
  assert.equal(next.problems.length, 0)
  assert.equal(next.documents.length, 2)
  assert.equal(goodPreparations, 1)
  assert.equal(badPreparations, 1)
  assert.equal(conversions, 2)
  assert.equal(next.originalFiles[0].dataUrl, bad.dataUrl)
  assert.equal(next.documents[1].originalMimeType, bad.mimeType)
  assert.equal(next.documents[1].sourceInputId, bad.id)
  assert.match(next.documents[1].id, /^file-/u)
  const same = await prepareFrontDeskMedia([good, bad], { ...options, cache: next.entries })
  assert.equal(same.problems.length, 0)
  assert.deepEqual([goodPreparations, badPreparations, conversions], [1, 1, 2])
})

test('a partial PDF returns successful pages and retries only failed pages without preparing again', async () => {
  const file = await pdf(), png = (await photo()).dataUrl
  let preparations = 0, renders = 0
  const options = { prepareDocuments: async files => { preparations++; return prepareDocuments(files) }, pdfPageImage: async () => { renders++; if (renders === 2) throw new Error('Explicit second-page render failure'); return png } }
  const first = await prepareFrontDeskMedia([file], options)
  assert.equal(first.entries[0].status, 'partial')
  assert.deepEqual(first.pages.map(page => page.page), [1])
  assert.equal(first.problems[0].page, 2)
  assert.equal(first.problems[0].sourceInputId, file.id)
  assert.equal(first.originalFiles[0].dataUrl, file.dataUrl)
  const next = await prepareFrontDeskMedia([file], { ...options, cache: first.entries, retryFileIds: [file.id] })
  assert.equal(next.entries[0].status, 'prepared')
  assert.deepEqual(next.pages.map(page => page.page), [1, 2])
  assert.deepEqual(next.originalFiles, [])
  assert.deepEqual(next.problems, [])
  assert.equal(preparations, 1)
  assert.equal(renders, 3)
  assert.equal(next.pages[0].imageDataUrl, first.pages[0].imageDataUrl)
})

test('an all-page render failure does not send the original PDF as a fake image', async () => {
  const file = await pdf()
  const result = await prepareFrontDeskMedia([file], { pdfPageImage: async () => { throw new Error('Explicit render failure') } })
  assert.deepEqual(result.pages, [])
  assert.deepEqual(result.documents, [])
  assert.deepEqual(result.problems.map(problem => problem.page), [1, 2])
  assert.equal(result.originalFiles[0].dataUrl, file.dataUrl)
})

test('retry selection leaves other failed files untouched and updates cache indexes after reordering', async () => {
  const firstFile = heic('first'), secondFile = heic('second'), jpeg = await jpegData(), calls = { first: 0, second: 0 }
  let repaired = false
  const options = { normalizePhoto: async file => { calls[file.id]++; if (!repaired) throw new Error('Explicit conversion failure'); return { dataUrl: jpeg } } }
  const first = await prepareFrontDeskMedia([firstFile, secondFile], options)
  const reordered = await prepareFrontDeskMedia([secondFile, firstFile], { ...options, cache: first.entries, retryFileIds: [] })
  assert.deepEqual(reordered.problems.map(problem => [problem.sourceInputId, problem.inputIndex]), [['second', 0], ['first', 1]])
  assert.deepEqual(calls, { first: 1, second: 1 })
  repaired = true
  const selected = await prepareFrontDeskMedia([firstFile, secondFile], { ...options, cache: first.entries, retryFileIds: [firstFile.id] })
  assert.deepEqual(calls, { first: 2, second: 1 })
  assert.equal(selected.problems[0].sourceInputId, secondFile.id)
  const all = await prepareFrontDeskMedia([secondFile, firstFile], { ...options, cache: selected.entries })
  assert.deepEqual(calls, { first: 2, second: 2 })
  assert.deepEqual(all.documents.map(document => [document.sourceInputId, document.inputIndex]), [['second', 0], ['first', 1]])
})

test('file-count and original-byte limits reject before any conversion or preparation', async () => {
  let calls = 0
  const options = { prepareDocuments: async () => { calls++; throw new Error('Must not be called') } }
  await assert.rejects(() => prepareFrontDeskMedia(Array.from({ length: 13 }, () => heic('same')), options), { code: 'FRONT_MEDIA_FILE_LIMIT', status: 413 })
  const large = { id: 'large', name: 'large.png', mimeType: 'image/png', dataUrl: `data:image/png;base64,${Buffer.alloc(15 * 1024 * 1024 + 1).toString('base64')}` }
  await assert.rejects(() => prepareFrontDeskMedia([large], options), { code: 'FRONT_MEDIA_TOTAL_LIMIT', status: 413 })
  assert.equal(calls, 0)
})

test('the aggregate page limit preserves prior valid pages and identifies the overflow file', async () => {
  const file = await pdf(), images = []
  for (let index = 0; index < 11; index++) images.push(await photo(`image-${index}`, { r: index + 1, g: 60, b: 80 }))
  const png = images[0].dataUrl
  const result = await prepareFrontDeskMedia([file, ...images], { pdfPageImage: async () => png })
  assert.equal(result.pages.length, 12)
  assert.equal(result.documents.length, 11)
  assert.equal(result.problems.length, 1)
  assert.equal(result.problems[0].code, 'FRONT_MEDIA_PAGE_LIMIT')
  assert.equal(result.problems[0].sourceInputId, images.at(-1).id)
  assert.equal(result.originalFiles[0].dataUrl, images.at(-1).dataUrl)
})

test('a changed source invalidates the cache even if its uploaded ID is reused', async () => {
  const firstFile = await photo('stable-id'), changed = await photo('stable-id', '#b34151'); let calls = 0
  const options = { prepareDocuments: async files => { calls++; return prepareDocuments(files) } }
  const first = await prepareFrontDeskMedia([firstFile], options)
  const next = await prepareFrontDeskMedia([changed], { ...options, cache: first.entries })
  assert.equal(calls, 2)
  assert.notEqual(next.documents[0].contentHash, first.documents[0].contentHash)
})

test('cancellation is propagated and is not converted into an attachment failure', async () => {
  const controller = new AbortController()
  const result = prepareFrontDeskMedia([heic('cancelled')], { signal: controller.signal, normalizePhoto: async () => { controller.abort(); return { dataUrl: await jpegData() } } })
  await assert.rejects(() => result, { name: 'AbortError' })
  await assert.rejects(() => prepareFrontDeskMedia([], { signal: controller.signal }), { name: 'AbortError' })
})
