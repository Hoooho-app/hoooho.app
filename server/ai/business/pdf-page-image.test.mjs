import test from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { createPdfPageImageRenderer, pdfPageImage } from './pdf-page-image.mjs'

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const input = id => `data:application/pdf;base64,${Buffer.from(String(id)).toString('base64')}`
async function until(check) {
  for (let i = 0; i < 500; i++) { if (check()) return; await setImmediate() }
  throw new Error('PDF render did not make progress')
}
function fakeRenderer(options = {}) {
  const loaded = [], rendered = [], cleaned = [], destroyed = [], gates = new Map()
  let active = 0, maxActive = 0, loads = 0
  const renderer = createPdfPageImageRenderer({ loadPdf: async () => {
    loads++
    return { getDocument({ data }) {
      const id = Buffer.from(data).toString()
      loaded.push(id)
      const gate = deferred(); gates.set(id, gate)
      const document = {
        numPages: options.invalidIds?.includes(id) ? 2 : 1,
        canvasFactory: {
          create: () => ({ context: {}, canvas: { toBuffer: () => Buffer.from('synthetic-png') } }),
          destroy: () => cleaned.push(id),
        },
        getPage: async () => ({
          getViewport: ({ scale }) => ({ width: 40 * scale, height: 40 * scale }),
          cleanup() {},
          render() {
            rendered.push(id); active++; maxActive = Math.max(maxActive, active)
            return {
              promise: gate.promise.finally(() => { active-- }),
              cancel: () => gate.reject(new DOMException('Cancelled', 'AbortError')),
            }
          },
        }),
        destroy: async () => { destroyed.push(id); await options.destroyGate?.promise },
      }
      return { promise: Promise.resolve(document), destroy: async () => {} }
    } }
  } })
  return { renderer, loaded, rendered, cleaned, destroyed, gates, get loads() { return loads }, get maxActive() { return maxActive } }
}

test('concurrent jobs queue FIFO and perform at most two PDF renders together', async () => {
  const f = fakeRenderer()
  // Four jobs with two page workers each share one renderer, as in production.
  const pending = Array.from({ length: 4 }, (_, job) => Promise.all(
    [0, 1].map(page => f.renderer(input(job * 2 + page))),
  ))
  await until(() => f.rendered.length === 2)
  assert.deepEqual(f.loaded, ['0', '1'])
  for (let i = 0; i < 6; i++) {
    f.gates.get(String(i)).resolve()
    await until(() => f.rendered.length === i + 3)
  }
  f.gates.get('6').resolve(); f.gates.get('7').resolve()
  const results = (await Promise.all(pending)).flat()
  assert.equal(results.length, 8)
  assert.ok(results.every(result => result.startsWith('data:image/png;base64,')))
  assert.deepEqual(f.rendered, Array.from({ length: 8 }, (_, i) => String(i)))
  assert.equal(f.maxActive, 2)
  assert.equal(f.cleaned.length, 8)
  assert.equal(f.destroyed.length, 8)
})

test('queued cancellation removes only that page and never loads or renders it', async () => {
  const f = fakeRenderer(), cancelled = new AbortController()
  const first = f.renderer(input('first')), second = f.renderer(input('second'))
  await until(() => f.rendered.length === 2)
  const queued = f.renderer(input('cancelled'), cancelled.signal)
  const rejected = assert.rejects(queued, { name: 'AbortError' })
  const next = f.renderer(input('next'))
  cancelled.abort()
  await rejected
  assert.equal(f.loads, 2)
  assert.deepEqual(f.loaded, ['first', 'second'])
  f.gates.get('first').resolve()
  await until(() => f.rendered.includes('next'))
  f.gates.get('second').resolve(); f.gates.get('next').resolve()
  await Promise.all([first, second, next])
  assert.equal(f.maxActive, 2)
  assert.deepEqual(f.rendered, ['first', 'second', 'next'])
})

test('slot stays occupied until document cleanup finishes and then resumes waiters', async () => {
  const destroyGate = deferred(), f = fakeRenderer({ destroyGate })
  const pending = ['first', 'second', 'next'].map(id => f.renderer(input(id)))
  await until(() => f.rendered.length === 2)
  f.gates.get('first').resolve(); f.gates.get('second').resolve()
  await until(() => f.destroyed.length === 2)
  assert.equal(f.loads, 2)
  destroyGate.resolve()
  await until(() => f.rendered.length === 3)
  f.gates.get('next').resolve()
  await Promise.all(pending)
  assert.equal(f.maxActive, 2)
})

test('render failure and active cancellation return slots without stranding queued pages', async () => {
  const f = fakeRenderer({ invalidIds: ['invalid'] }), cancelled = new AbortController()
  const active = f.renderer(input('active'), cancelled.signal)
  const activeRejected = assert.rejects(active, { name: 'AbortError' })
  await until(() => f.rendered.includes('active'))
  const invalid = f.renderer(input('invalid'))
  const invalidRejected = assert.rejects(invalid, { code: 'AI_PDF_RENDER_FAILED' })
  const following = ['next-a', 'next-b', 'next-c'].map(id => f.renderer(input(id)))
  cancelled.abort()
  await Promise.all([activeRejected, invalidRejected])
  await until(() => f.rendered.includes('next-a') && f.rendered.includes('next-b'))
  f.gates.get('next-a').resolve(); f.gates.get('next-b').resolve()
  await until(() => f.rendered.includes('next-c'))
  f.gates.get('next-c').resolve()
  await Promise.all(following)
  assert.equal(f.maxActive, 2)
  const alreadyAborted = new AbortController(); alreadyAborted.abort()
  await assert.rejects(f.renderer(input('never-load'), alreadyAborted.signal), { name: 'AbortError' })
  assert.ok(!f.loaded.includes('never-load'))
})

test('default shared renderer converts six real PDFs concurrently without BUSY failures', async () => {
  const pdf = await PDFDocument.create(); pdf.addPage([40, 40])
  const dataUrl = `data:application/pdf;base64,${Buffer.from(await pdf.save()).toString('base64')}`
  const results = await Promise.all(Array.from({ length: 6 }, () => pdfPageImage(dataUrl)))
  for (const result of results) {
    const metadata = await sharp(Buffer.from(result.split(',')[1], 'base64')).metadata()
    assert.equal(metadata.format, 'png')
    assert.equal(metadata.width, 80)
    assert.equal(metadata.height, 80)
  }
})
