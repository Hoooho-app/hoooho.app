const kinds = new Set(['none', 'save', 'save_original', 'query', 'export', 'update', 'delete', 'stop', 'cancel'])
// This is an operation boundary, not a health-input classifier. A complete,
// unambiguous save command needs no model to restate IDs the UI already sent.
export function directFrontDeskSaveRequest({message,presentedDraft,pendingSaveConfirmation}={}){
  const text=String(message?.text??'').trim()
  if(!presentedDraft||(message?.files?.length??0)>0||(message?.originalFiles??[]).some(file=>!file.mimeType?.startsWith('audio/'))||(message?.voices?.length??0)>0&&!(message.kind==='voice'&&message.transcriptVerified===true))return null
  if(/^(?:(?:请|帮我|麻烦|现在|直接|就|先|确认)\s*)*(?:保存|存下|存起来|入档)(?:这(?:一)?条|这份|这个|当前(?:这条)?|刚才这条|这些|全部|所有|记录|草稿)?[。！!\s]*$/u.test(text))return {type:'save',targetIds:[presentedDraft.id],targetVersion:presentedDraft.version,confirmation:'explicit',quote:text}
  if(pendingSaveConfirmation&&/^(?:好|好的|嗯|是|是的|可以|确认)[。！!\s]*$/u.test(text))return {type:'save',targetIds:[pendingSaveConfirmation.targetId],targetVersion:pendingSaveConfirmation.targetVersion,confirmation:'affirmative_answer',quote:text}
  return null
}
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 180
const version = value => Number.isSafeInteger(value) && value >= 1
const trimmed = value => typeof value === 'string' ? value.replace(/[\u200B-\u200D\u2060\uFEFF]/gu, '').trim() : ''

// This is an authorization boundary, not a dialogue classifier. It checks the
// original user command after the model has proposed an action; it never
// interprets a clinical short answer or derives a save from acknowledgement.
function instructionText(value) {
  return trimmed(value)
    .replace(/```[\s\S]*?```/gu, '')
    .replace(/^\s*>.*$/gmu, '')
    .replace(/“[^”]*”|「[^」]*」|『[^』]*』|"[^"]*"|'[^']*'/gu, '')
    .replace(/(?:报告|图片|照片|截图|材料|原文|说明书|药盒|处方|文件)[^，。；;\n]{0,18}(?:写着|写了|显示|提到|要求|说|内容是|上写|里写)[^，。；;\n]*/gu, '')
}

function explicitAuthorization(type, text, quote) {
  const instruction = instructionText(text)
  if (!trimmed(quote) || !String(text).includes(quote) || !instruction.includes(quote)) return false
  const clauses = instruction.split(/[，,。；;！!\n]/u).map(trimmed).filter(Boolean)
  const commands = clauses.filter(clause => clause.includes(quote) || quote.includes(clause))
  const applicable = commands.length ? commands : [instruction]
  return applicable.some(clause => {
    if (/(?:是什么意思|什么意思|怎么用|如何使用|有什么区别|字样|按钮说明|假设|如果|举例|示例|转述)/u.test(clause)) return false
    if (type === 'save' || type === 'save_original') {
      if (/(?:不(?:用|要|必|能)|别|暂不|先不|尚不).{0,12}(?:保存|入档|存下|存到)|只(?:想|要)?整理/u.test(clause)) return false
      return /^(?:(?:请|麻烦|帮我|替我|给我|我要|我想|我决定|我确认|直接|现在|就|先|只)\s*)*(?:把[^，。；;\n]{0,80})?(?:保存|存下|存起来|存到|入档|只保留(?:这张|这条|原话|原图|照片|录音))/u.test(clause)
    }
    if (type === 'delete') return !/(?:不要|不用|别|暂不).{0,8}(?:删|删除)/u.test(clause) && /^(?:(?:请|帮我|替我|我要|我确认|直接|现在|就)\s*)*(?:把[^，。；;\n]{0,80})?(?:删除|删掉)/u.test(clause)
    if (type === 'update') return !/(?:不要|不用|别|暂不).{0,8}(?:修改|改成|更新|更正)/u.test(clause) && /修改|改成|更新|更正/u.test(clause)
    if (type === 'export') return !/(?:不要|不用|别|暂不).{0,8}(?:导出|下载)/u.test(clause) && /导出|下载|交接|发给医生/u.test(clause)
    if (type === 'query') return /查|找|看|哪里|哪条|上次|刚才/u.test(clause)
    if (type === 'stop') return /停止|别问|不用(?:再|继续)?问|不再问|先这样|算了|到这里/u.test(clause)
    if (type === 'cancel') return /取消|停止|停下|别处理|不用处理/u.test(clause)
    return false
  })
}

function userMessage(message) {
  const source = typeof message?.source === 'string' ? message.source : message?.source?.kind
  return Boolean(message && id(message.id) && message.kind !== 'assistant' && message.role !== 'assistant' && !['assistant', 'model', 'attachment', 'document', 'report', 'history', 'summary'].includes(source) && !['assistant', 'model', 'attachment', 'document', 'report', 'history', 'summary'].includes(message.sourceType) && !message.quoted && !['discarded', 'retracted', 'failed'].includes(message.status) && message.transcriptConfirmed !== false)
}

const trueReceipt = receipt => Boolean(receipt && (receipt.state === 'saved' || receipt.saved === true || receipt.success === true) && (id(receipt.recordId) || receipt.recordIds?.some(id) || receipt.result?.records?.some(record => id(record.recordId))))
const receiptVersion = receipt => receipt.confirmedVersion ?? receipt.targetVersion ?? receipt.version
function originalsAvailable(originals) {
  if (!originals) return false
  return Boolean(trimmed(originals.text) || (originals.attachments ?? []).some(attachment => typeof attachment === 'string' ? id(attachment) : id(attachment?.id) && attachment.retained !== false && !['removed', 'discarded', 'failed'].includes(attachment.status) && attachment.bytes !== 0))
}
function originalReferences(originals) {
  return {
    messageIds: [...new Set((originals.messageIds ?? []).filter(id))],
    attachmentIds: [...new Set((originals.attachments ?? []).filter(attachment => typeof attachment === 'string' ? id(attachment) : id(attachment?.id) && attachment.retained !== false && !['removed', 'discarded', 'failed'].includes(attachment.status) && attachment.bytes !== 0).map(attachment => typeof attachment === 'string' ? attachment : attachment.id))],
    hasText: Boolean(trimmed(originals.text))
  }
}

/**
 * Pure operation planner. candidate, presentedDraft and targets are trusted
 * service snapshots, never fields copied from the model response. This function
 * performs no I/O; callers recheck permission/version inside their transaction.
 */
export function planFrontDeskAction(input = {}) {
  const { message, contextId, contextVersion, expectedContextVersion, candidate, presentedDraft, previousQuestion } = input
  const requested = input.requestedAction ?? { type: 'none' }
  const base = { contextId: contextId ?? null, expectedContextVersion: expectedContextVersion ?? null, sourceMessageId: message?.id ?? null }
  const none = reason => ({ ...base, type: 'none', reason })
  const clarify = reason => ({ ...base, type: 'clarify', reason })
  if (!kinds.has(requested.type)) return none('unsupported_action')
  if (requested.type === 'none') return none('no_action')
  if (!userMessage(message)) return none('not_current_user_instruction')
  if (!id(contextId)) return clarify('missing_context')
  if (!version(contextVersion) || !version(expectedContextVersion) || contextVersion !== expectedContextVersion) return clarify('stale_context')
  if (['result', 'receipt', 'completed', 'saved', 'success'].some(key => Object.hasOwn(requested, key))) return none('model_receipt_is_not_authority')
  const targetIds = requested.targetIds ?? []
  if (!Array.isArray(targetIds) || targetIds.some(value => !id(value)) || targetIds.length > 12 || new Set(targetIds).size !== targetIds.length) return clarify('invalid_target')
  const quote = requested.quote ?? ''
  let authorized = requested.confirmation === 'explicit' && explicitAuthorization(requested.type, message.text ?? '', quote)

  if (requested.confirmation === 'affirmative_answer') {
    const previousTargets = previousQuestion?.targetIds ?? (previousQuestion?.targetId ? [previousQuestion.targetId] : [])
    const sourceMatches = !message.answerTo?.messageId || message.answerTo.messageId === previousQuestion?.messageId
    authorized = ['save', 'save_original'].includes(requested.type)
      && /^(?:好|好的|嗯|是|是的|可以|确认)[。！!\s]*$/u.test(trimmed(message.text))
      && trimmed(quote) === trimmed(message.text)
      && previousQuestion?.kind === 'save_confirmation'
      && previousQuestion.answered !== true && previousQuestion.valid !== false
      && previousQuestion.contextId === contextId && previousQuestion.contextVersion === contextVersion
      && id(previousQuestion.messageId) && sourceMatches
      && previousTargets.length === 1 && targetIds.length === 1 && targetIds[0] === previousTargets[0]
      && previousQuestion.targetVersion === requested.targetVersion
  }
  if (!authorized) return none('no_explicit_authorization')

  const operation = (type, targetId = contextId, targetVersion = contextVersion, extra = {}) => ({
    ...base, type, operationId: `${message.id}:${type}:${targetVersion}`,
    targetId, targetVersion, ...extra
  })
  if (requested.type === 'stop' || requested.type === 'cancel') {
    if (targetIds.length && (targetIds.length !== 1 || targetIds[0] !== contextId)) return clarify('invalid_target')
    return operation(requested.type)
  }
  if (targetIds.length !== 1 || !version(requested.targetVersion)) return clarify('target_or_version_not_unique')
  const targetId = targetIds[0]
  const receipts = input.receipts ?? []
  if (requested.type === 'save' || requested.type === 'save_original') {
    const existing = receipts.find(receipt => trueReceipt(receipt) && (receipt.targetId === targetId || receipt.candidateId === targetId || receipt.id === targetId) && receiptVersion(receipt) === requested.targetVersion && (!receipt.contextId || receipt.contextId === contextId))
    if (existing) return operation('readback', targetId, requested.targetVersion, { originalAction: requested.type, receipt: structuredClone(existing) })
    const candidates = candidate ? Array.isArray(candidate) ? candidate : [candidate] : []
    const matches = candidates.filter(receipt => receipt.id === targetId || receipt.itemIds?.includes(targetId))
    if (matches.length !== 1) return clarify('candidate_not_unique')
    const selected = matches[0]
    if (selected.contextId && selected.contextId !== contextId) return clarify('wrong_candidate_context')
    if (!version(selected.version) || selected.version !== requested.targetVersion || !presentedDraft || presentedDraft.id !== selected.id || presentedDraft.version !== selected.version) return clarify('candidate_not_presented_or_changed')
    if (selected.saved || selected.state === 'saved') return clarify('saved_receipt_not_verified')
    if (selected.subjectConfirmed !== true) return clarify('subject_not_confirmed')
    const originals = input.originals ?? selected.originals ?? presentedDraft.originals
    if (requested.type === 'save_original') {
      if (!originalsAvailable(originals)) return clarify('missing_originals')
      return operation('save_original', selected.id, selected.version, { itemIds: [], originals: originalReferences(originals) })
    }
    if (selected.ready !== true) return clarify('candidate_not_ready')
    if (!Array.isArray(selected.itemIds) || !selected.itemIds.length || selected.itemIds.some(value => !id(value))) return clarify('empty_candidate')
    const explicitItem = selected.itemIds.includes(targetId)
    const all = /全部|所有|都保存|这些(?:记录|内容|草稿)?(?:都)?保存|保存(?:这些|全部|所有)/u.test(instructionText(message.text ?? ''))
    if (!explicitItem && selected.itemIds.length !== 1 && !all) return clarify('candidate_items_not_unique')
    const itemIds = explicitItem ? [targetId] : [...selected.itemIds]
    return operation('save', selected.id, selected.version, { itemIds })
  }

  const targets = input.targets ?? []
  const matches = targets.filter(target => target.id === targetId && (!target.contextId || target.contextId === contextId) && target.accessible !== false)
  if (matches.length !== 1 || matches[0].version !== requested.targetVersion) return clarify('target_not_available_or_changed')
  if (['update', 'delete', 'export'].includes(requested.type) && matches[0].subjectConfirmed === false) return clarify('subject_not_confirmed')
  return operation(requested.type, targetId, requested.targetVersion)
}
