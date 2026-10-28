// Presentation permissions belong to the current task, not the existence of a
// background extraction. These decisions never create a health record.
export function visitPreparationEligible(messages) {
  let eligible = false, visitQuestion = false
  for (const message of messages) {
    if (message.status !== 'completed' || message.retracted) continue
    const text = (message.text ?? '').trim()
    if (message.kind === 'assistant') {
      visitQuestion = /[?？]/u.test(text) && /(?:去医院|看医生|看病|就医|就诊|挂号)/u.test(text)
      continue
    }
    if (!['text', 'voice'].includes(message.kind)) continue
    const clauses = text.split(/[。；;\n]/u)
    const declined = /(?:(?:不用|不想|不准备|不打算|暂不|暂时不|先不|不要|不需要|不考虑|不愿意|没有要|不是要)(?:现在|再|先)?(?:去医院|去看(?:医生|病)|看医生|看病|就医|就诊|挂号|整理|生成.{0,4}(?:清单|情况单))|不去医院|不看医生|不看病|不就医|不就诊)/u.test(text)
    if (declined) eligible = false
    else if (clauses.some(clause => {
      if (/^(?:上次|以前|去年|上周|昨天|前天|已经|刚从)/u.test(clause.trim()) && !/(?:这次|下次|接下来|明天|准备|打算|现在要)/u.test(clause)) return false
      return /(?:挂什么(?:号|科)|挂哪个科|挂哪一科|去哪(?:家)?医院|哪个医院|哪家医院|什么医院|就医情况单|就诊情况单|就诊清单)/u.test(clause)
        || /(?:准备|打算|计划|想|要不要|是否|需不需要|需要|应该|该|可以|能不能|可不可以|什么时候|什么情况|现在要|明天去).{0,16}(?:去医院|看医生|看病|就医|就诊|挂号|医院)/u.test(clause)
        || /^(?:去医院|去看医生|去看病|去就医|去就诊|挂号)(?:[吧吗？?，,。]|$)/u.test(clause.trim())
    })) eligible = true
    else if (visitQuestion && /^(?:嗯|好|好的|是|是的|对|需要|可以|去|想去|准备去)(?:[，,。！!\s]|$)/u.test(text)) eligible = true
    visitQuestion = false
  }
  return eligible
}

export function continuousPresentation(context, messages, { recordable, hasOriginals, saved }) {
  const inputs = messages.filter(message => message.kind !== 'assistant' && message.status !== 'discarded')
  const processing = inputs.some(message => ['pending', 'transcribing'].includes(message.status))
  const asking = context.interview?.status === 'asking' && Boolean(context.interview.question)
  const generation = context.recordGeneration
  const evidenceVersion = context.evidenceVersion ?? 0, editRevision = context.editRevision ?? 0
  // Previously saved versions remain readable after upgrading the client.
  const generated = generation
    ? generation.evidenceVersion === evidenceVersion && generation.editRevision === editRevision
    : Boolean(saved && saved.evidenceVersion === evidenceVersion && saved.editRevision === editRevision)
  const partial = inputs.some(message => message.status === 'failed')
  return {
    generated,
    canGenerate: Boolean((recordable || hasOriginals) && !processing && (!asking || (context.interview?.turnCount ?? 0) >= 2) && (!context.provisional || partial)),
    processing,
    asking,
    partial,
    visitEligible: visitPreparationEligible(messages)
  }
}
