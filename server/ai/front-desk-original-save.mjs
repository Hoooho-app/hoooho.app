import { createHash } from 'node:crypto'
import { accountTransaction } from '../auth/storage/transaction.mjs'
import { fail } from './business/contract.mjs'
import { FRONT_DESK_UNDERSTANDING_VERSION } from './front-desk-understanding.mjs'
import { parseStrictInstant } from '../time/strict-date.mjs'

const id = value => typeof value === 'string' && /^[A-Za-z0-9:_-]{1,180}$/u.test(value)
const version = value => Number.isSafeInteger(value) && value > 0 && value < Number.MAX_SAFE_INTEGER
const order = (a, b) => (a.inputAt ?? Date.parse(a.at)) - (b.inputAt ?? Date.parse(b.at)) || a.id.localeCompare(b.id)
const unavailable = value => !value || value.deleted === true || value.deletedAt || value.available === false || ['deleted', 'discarded', 'removed', 'unavailable'].includes(value.status) || ['deleted', 'discarded', 'removed', 'unavailable'].includes(value.state)
const hash = value => createHash('sha256').update(value).digest('hex')
const notAvailable = () => fail('已保存的原件记录已删除或不可访问', 404, 'FRONT_ORIGINAL_UNAVAILABLE')

function assertSubject(subject, memberId, required = false) {
  if (!subject) { if (required) throw fail('请先确认原件的实际对象', 409, 'FRONT_SUBJECT_UNCONFIRMED'); return }
  if (['other', 'multiple'].includes(subject.kind) || subject.memberId != null && subject.memberId !== memberId) throw fail('资料包含其他人物，请分开核对', 409, 'FRONT_SUBJECT_MISMATCH')
  if (required && (subject.kind !== 'current' || subject.memberId !== memberId || subject.confirmed !== true)) throw fail('请先确认原件的实际对象', 409, 'FRONT_SUBJECT_UNCONFIRMED')
}

function assertOriginalsSubject(context, memberId) {
  assertSubject(context.subject, memberId, true)
  if ((context.originalsVersion ?? 0) > 0 && (!Number.isSafeInteger(context.originalsVersion) || context.subject.confirmedBy !== 'user' || context.subject.confirmation?.originalsVersion !== context.originalsVersion)) throw fail('原件已有变化，请重新确认实际对象', 409, 'FRONT_SUBJECT_UNCONFIRMED')
}

function validateFile(file, memberId) {
  assertSubject(file?.subject, memberId)
  const match = /^data:((?:image\/(?:jpeg|png|webp|heic|heif)|application\/pdf|audio\/(?:webm|mp4|ogg|wav|mpeg))(?:;\s*codecs=(?:"[a-z0-9., _-]+"|[a-z0-9.,_-]+))?);base64,([A-Za-z0-9+/]+={0,2})$/iu.exec(file?.dataUrl ?? '')
  if (!match || typeof file.mimeType !== 'string' || file.mimeType.toLowerCase() !== match[1].toLowerCase()) throw fail('原件内容无效，已有对话仍保留', 422, 'FRONT_ORIGINAL_FILE_INVALID')
  const bytes = Buffer.from(match[2], 'base64')
  if (!bytes.length || bytes.toString('base64').replace(/=+$/u, '') !== match[2].replace(/=+$/u, '')) throw fail('原件内容无效，已有对话仍保留', 422, 'FRONT_ORIGINAL_FILE_INVALID')
  const contentHash = hash(bytes)
  return { id: id(file.id) ? file.id : `original-${contentHash.slice(0, 24)}`, name: String(file.name || '原件').replace(/[\\/\x00-\x1f]/gu, '').slice(0, 120), mimeType: match[1], dataUrl: file.dataUrl, contentHash, binarySize: bytes.length, lastModified: Number.isFinite(file.lastModified) ? file.lastModified : 0, ...(typeof file.sourceInputId === 'string' ? { sourceInputId: file.sourceInputId } : {}), ...(file.originalMimeType ? { originalMimeType: file.originalMimeType } : {}) }
}

function sameOriginal(original, prepared) {
  if (original.sourceInputId && prepared.sourceInputId) return original.sourceInputId === prepared.sourceInputId
  if (original.id && prepared.sourceInputId === original.id || original.sourceInputId && prepared.id === original.sourceInputId) return true
  if (original.dataUrl === prepared.dataUrl) return true
  // Older snapshots may lack sourceInputId. A converted HEIC needs both the
  // original format and original input position; a shared basename alone is
  // insufficient to discard another successful JPEG.
  const stem = name => typeof name === 'string' ? name.replace(/\.(?:hei[cf]|jpe?g)$/iu, '') : null
  return /^image\/hei[cf]$/iu.test(original.mimeType ?? '') && prepared.originalMimeType === original.mimeType && Number.isInteger(original.inputIndex) && original.inputIndex === prepared.inputIndex && stem(original.name) !== null && stem(original.name) === stem(prepared.name)
}

export function originals(messages, memberId) {
  const files = []
  for (const message of messages) {
    for (const key of ['files', 'originalFiles', 'voices']) if (message[key] != null && !Array.isArray(message[key])) throw fail('原件列表无效', 422, 'FRONT_ORIGINAL_FILE_INVALID')
    for (const candidate of [...message.files ?? [], ...message.originalFiles ?? [], ...message.voices ?? []]) assertSubject(candidate?.subject, memberId)
    const retained = message.originalFiles ?? []
    const prepared = (message.files ?? []).filter(file => !retained.some(original => sameOriginal(original, file)))
    files.push(...[...retained, ...prepared, ...(message.voices ?? [])].map(file => validateFile(file, memberId)))
  }
  if (files.length > 12 || files.reduce((sum, file) => sum + file.binarySize, 0) > 15 * 1024 * 1024) throw fail('原件最多12份，总大小15 MB', 413, 'FRONT_ORIGINAL_LIMIT')
  return [...new Map(files.map(file => [`${file.mimeType}:${file.contentHash}`, file])).values()]
}

function completedMessages(data, contextId, accountId, memberId) {
  const rejected = new Set(['assistant', 'model', 'attachment', 'document', 'report', 'history', 'summary'])
  // A failed reply can still have an independently accepted durable input.
  // This permits explicit original preservation, never fact extraction.
  const acceptedInput = message => message.status === 'failed' && message.acceptedInput === true && typeof message.inputAcceptedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})$/iu.test(message.inputAcceptedAt) && Boolean(parseStrictInstant(message.inputAcceptedAt))
  return data.messages.filter(message => message.contextId === contextId && message.accountId === accountId && message.memberId === memberId && (message.status === 'completed' || acceptedInput(message)) && ['text', 'voice', 'image'].includes(message.kind) && id(message.id) && !rejected.has(message.role) && !rejected.has(typeof message.source === 'string' ? message.source : message.source?.kind) && !rejected.has(message.sourceType) && !message.quoted && !message.retracted).sort(order)
}

async function replay({ receipt, business, front, accountId, memberId, contextId, draftId, signal }) {
  if (receipt.state !== 'saved' || receipt.success === false || receipt.contextId !== contextId || receipt.type !== 'save_original' || receipt.targetId !== draftId || receipt.targetVersion !== 1 || receipt.confirmedVersion !== 1 || !Array.isArray(receipt.recordIds) || receipt.recordIds.length !== 1 || !id(receipt.recordIds[0]) || receipt.savedDraft?.id !== draftId || receipt.savedDraft?.state !== 'saved' || receipt.savedDraft.result?.records?.length !== 1 || receipt.savedDraft.result.records[0].recordId !== receipt.recordIds[0]) throw notAvailable()
  try {
    const record = await business.records.getOwnedRecord(accountId, receipt.recordIds[0])
    if (unavailable(record) || record.id !== receipt.recordIds[0] || record.accountId !== accountId || record.memberId != null && record.memberId !== memberId || record.aiProvenance?.draftId !== draftId || record.aiProvenance?.provider !== 'manual' || !id(record.eventId)) throw notAvailable()
    const event = await business.events.get(accountId, record.eventId)
    if (unavailable(event) || event.accountId !== accountId || event.memberId !== memberId || event.id !== record.eventId) throw notAvailable()
  } catch { throw notAvailable() }
  signal?.throwIfAborted()
  return { savedDraft: structuredClone(receipt.savedDraft), context: await front.snapshot(accountId, memberId, contextId) }
}

/** Explicit original preservation, independent of recognition jobs or AI. */
export async function saveFrontDeskOriginal({ front, business, accountId, memberId, contextId, input, signal } = {}) {
  if (!input || input.confirmed !== true || !id(contextId)) throw fail('请明确确认保存原话和原件', 422, 'FRONT_ORIGINAL_CONFIRMATION_REQUIRED')
  if(input.reviewText!==undefined&&(typeof input.reviewText!=='string'||!input.reviewText.trim()||input.reviewText.trim().length>4900))throw fail('请核对有效文字后保存',422,'FRONT_ORIGINAL_REVIEW_INVALID')
  const reviewSignature=input.reviewText===undefined?null:hash(input.reviewText.trim())
  const expected = input.expectedContextVersion ?? input.expectedVersion
  if (!version(expected) || input.expectedContextVersion != null && input.expectedVersion != null && input.expectedContextVersion !== input.expectedVersion) throw fail('对话版本无效，请重新核对', 409, 'FRONT_CONTEXT_CHANGED')
  if (!front?.directory || front.directory !== business?.directory) throw new TypeError('Front desk and business storage must match')
  const draftId = `front-original-${hash(JSON.stringify([accountId, memberId, contextId, expected])).slice(0, 40)}`
  const operationId = `${draftId}:save_original`
  return accountTransaction(front.directory, async () => {
    signal?.throwIfAborted()
    await front.scope(accountId, memberId)
    await business.scoped(accountId, memberId)
    const data = await front.store.read(), context = data.contexts.find(context => context.id === contextId && context.accountId === accountId && context.memberId === memberId)
    if (!context) throw fail('未找到本次对话', 404, 'FRONT_RECORD_NOT_FOUND')
    if (context.operationReceipts != null && !Array.isArray(context.operationReceipts)) throw fail('保存回执无效，请重新核对', 409, 'FRONT_RECORD_CHANGED')
    const receipt = context.operationReceipts?.find(receipt => receipt.operationId === operationId && receipt.inputContextVersion === expected)
    if(receipt&&(receipt.reviewSignature??null)!==reviewSignature)throw fail('这次核对内容已有变化，请查看原保存结果',409,'FRONT_ORIGINAL_REVIEW_CHANGED')
    if (receipt) return replay({ receipt, business, front, accountId, memberId, contextId, draftId, signal })
    if (context.saved) throw fail('这次对话已有保存结果，请查看原记录', 409, 'FRONT_RECORD_ALREADY_SAVED')
    if (context.closedAt || unavailable(context) || context.version !== expected || front.inFlight?.has(JSON.stringify([accountId, memberId]))) throw fail('对话已有更新或已结束，请重新核对', 409, 'FRONT_CONTEXT_CHANGED')
    assertOriginalsSubject(context, memberId)
    const originalsVersion = context.originalsVersion ?? 0
    for (const fact of context.facts ?? []) if (fact.status === 'active') assertSubject(fact.subject, memberId, true)
    const messages = completedMessages(data, contextId, accountId, memberId)
    for (const message of messages) {
      assertSubject(message.subject, memberId)
      assertSubject(message.understanding?.subject, memberId)
      if (typeof message.text !== 'string') throw fail('原话内容无效', 422, 'FRONT_ORIGINAL_INPUT_INVALID')
    }
    const raw = messages.map(message => message.text).filter(Boolean).join('\n'), files = originals(messages, memberId)
    if (!raw.trim() && !files.length) throw fail('没有可保存的原话或原件', 422, 'FRONT_ORIGINAL_INPUT_REQUIRED')
    if (raw.length > 15000) throw fail('原话过长，请分批保存', 413, 'FRONT_ORIGINAL_LIMIT')
    const evidenceVersion = context.evidenceVersion ?? 0
    if (!Number.isSafeInteger(evidenceVersion) || evidenceVersion < 0) throw fail('对话依据版本无效', 409, 'FRONT_RECORD_CHANGED')
    // Normalize a legacy missing evidence counter before the shared save guard.
    if (context.evidenceVersion == null) await front.store.update(data => ({ ...data, contexts: data.contexts.map(current => current.id === contextId && current.accountId === accountId && current.memberId === memberId ? { ...current, evidenceVersion } : current) }))
    const now = business.now(), title = raw.trim() ? '原话记录' : '原件记录'
    const sources = raw ? [{ id: 'original-text', page: 1, text: raw, status: 'readable' }] : []
    const quotes = raw ? [{ sourceId: 'original-text', page: 1, quote: raw }] : []
    // Long originals remain complete in sourceText and the immutable source;
    // the neutral content label stays inside the existing 5000-char limit.
    const value = input.reviewText?.trim() ?? (raw && raw.length <= 4900 ? raw : title)
    const reviewTextChanged=input.reviewText!==undefined&&value!==raw.trim()
    const draft = { id: draftId, accountId, memberId, version: 1, state: 'ready', raw, referenceNow: now.toISOString(), timezone: 'Asia/Shanghai', task: 'record', manualOriginal: true, reviewTextChanged, smartRecord: true, frontDeskRecord: true, followUp: false, confirmOccurrenceTime: false, selectedOccurredAt: null, sourceIdentity: 'parent', targetEventId: null, sourceRecordId: null, frontContextId: contextId, frontEvidenceVersion: evidenceVersion, frontSubject: structuredClone(context.subject), frontUnderstanding: { version: FRONT_DESK_UNDERSTANDING_VERSION, recordChangesPending: false }, documents: files.filter(file => !file.mimeType.startsWith('audio/')), voices: files.filter(file => file.mimeType.startsWith('audio/')), pages: [], sources, items: [{ id: 'original', category: 'other', title, subject: 'current', subjectConfirmed: true, subjectMemberId: memberId, archiveCategory: null, timeText: null, fields: [{ name: 'conclusion', value, sources: quotes, confirmed: true, editedBy: 'user' }] }], questions: [], conflicts: [], diagnostics: [], history: reviewTextChanged?[raw]:[], unmappedRows: [], documentWarnings: [], expiresAt: new Date(now.getTime() + 86400000).toISOString() }
    draft.items = draft.items.map(item => business.resolve(item, draft))
    const assertCurrent = async () => {
      signal?.throwIfAborted()
      await front.scope(accountId, memberId)
      const currentData = await front.store.read(), current = currentData.contexts.find(current => current.id === contextId && current.accountId === accountId && current.memberId === memberId)
      if (!current || current.closedAt || current.saved || current.version !== expected || (current.evidenceVersion ?? 0) !== evidenceVersion) throw fail('对话已有更新或已结束，本次未保存', 409, 'FRONT_CONTEXT_CHANGED')
      assertOriginalsSubject(current, memberId)
      if ((current.originalsVersion ?? 0) !== originalsVersion) throw fail('对话原件已有变化，请重新核对', 409, 'FRONT_RECORD_CHANGED')
      if (JSON.stringify(current.facts ?? []) !== JSON.stringify(context.facts ?? []) || JSON.stringify(current.subject) !== JSON.stringify(context.subject)) throw fail('记录对象或依据已有变化，请重新核对', 409, 'FRONT_RECORD_CHANGED')
      if (JSON.stringify(completedMessages(currentData, contextId, accountId, memberId)) !== JSON.stringify(messages)) throw fail('对话原件已有变化，请重新核对', 409, 'FRONT_RECORD_CHANGED')
    }
    await assertCurrent()
    await business.write(draft)
    await assertCurrent()
    const savedDraft = await business.save(accountId, memberId, draftId, { version: 1, confirmed: true })
    await assertCurrent()
    if (savedDraft.state !== 'saved' || savedDraft.result?.records?.length !== 1 || !id(savedDraft.result.records[0].recordId)) throw fail('保存结果尚未确认', 409, 'FRONT_SAVE_RECEIPT_MISSING')
    await front.checkpoint(accountId, memberId, contextId, { draftId }, () => signal?.throwIfAborted())
    const savedReceipt = { operationId, reviewSignature, sourceMessageIds:messages.map(message=>message.id), type: 'save_original', contextId, inputContextVersion: expected, targetId: draftId, targetVersion: 1, confirmedVersion: 1, state: 'saved', recordIds: [savedDraft.result.records[0].recordId], savedDraft }
    await front.store.update(data => {
      signal?.throwIfAborted()
      const current = data.contexts.find(current => current.id === contextId && current.accountId === accountId && current.memberId === memberId)
      if (!current || current.closedAt || current.version !== expected || (current.evidenceVersion ?? 0) !== evidenceVersion) throw fail('对话已有更新或已结束，本次未保存', 409, 'FRONT_CONTEXT_CHANGED')
      assertOriginalsSubject(current, memberId)
      if ((current.originalsVersion ?? 0) !== originalsVersion) throw fail('对话原件已有变化，请重新核对', 409, 'FRONT_RECORD_CHANGED')
      return { ...data, contexts: data.contexts.map(item => item === current ? { ...item, version: expected + 1, updatedAt: business.now().toISOString(), operationReceipts: [...(item.operationReceipts ?? []), savedReceipt] } : item) }
    })
    const snapshot = await front.snapshot(accountId, memberId, contextId)
    signal?.throwIfAborted()
    return { savedDraft, context: snapshot }
  })
}
