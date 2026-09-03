const healthSignal = /体温|发热|发烧|咳|头痛|头疼|头晕|疼|痛|痒|皮疹|呕吐|吐|腹泻|鼻塞|咽痛|麻|喘|不舒服|好转|加重|复发|用药|吃了|服用|检查|就医/
const ambiguousSubject = /(?:^|[，。；\s])(他|她|这个人)(?:的|现在|今天|昨天|刚才|有|没|不|$)/

function aliasesFor(member) {
  const aliases = [member?.name].filter(Boolean)
  if (member?.isSelf || member?.relationship === 'self') aliases.push('我', '我自己', '本人')
  if (member?.relationship === 'child') aliases.push('宝宝', '孩子', '儿子', '女儿', '小孩')
  if (member?.relationship === 'parent') aliases.push('老人', '爸爸', '妈妈', '父亲', '母亲')
  if (member?.relationship === 'spouse') aliases.push('爱人', '配偶', '丈夫', '妻子')
  return [...new Set(aliases)].sort((left, right) => right.length - left.length)
}

function containsAlias(text, aliases) {
  return aliases.find((alias) => alias === '我'
    ? /(?:^|[，。；\s])我(?!们)/.test(text)
    : alias.length === 1
      ? new RegExp(`(?:^|[，。；\s])${alias}(?:自己|的|现在|今天|昨天|刚才|有|没|不|也|$)`).test(text)
      : text.includes(alias)) ?? null
}

function subjectForText(text, eventMember, members) {
  const sourceText = String(text ?? '')
  if (ambiguousSubject.test(sourceText)) return { kind: 'ambiguous', memberId: null, text: RegExp.$1 }
  const eventAlias = containsAlias(sourceText, aliasesFor(eventMember))
  const mentionedMembers = members
    .map((member) => ({ member, alias: containsAlias(sourceText, aliasesFor(member)) }))
    .filter(({ alias }) => alias)
  const unique = [...new Map(mentionedMembers.map((item) => [item.member.id, item])).values()]
  if (unique.length > 1) return { kind: 'multiple', memberId: null, text: unique.map(({ alias }) => alias).join('、') }
  if (unique.length === 1) {
    const { member, alias } = unique[0]
    return { kind: member.id === eventMember.id ? 'event_member' : member.isSelf ? 'account_self' : 'other_member', memberId: member.id, text: alias }
  }
  const self = members.find((member) => member.isSelf)
  const selfAlias = containsAlias(sourceText, ['我自己', '本人', '我'])
  if (selfAlias) return {
    kind: self?.id === eventMember.id ? 'event_member' : 'account_self',
    memberId: self?.id ?? '__account_self__',
    text: selfAlias
  }
  if (eventAlias) return { kind: 'event_member', memberId: eventMember.id, text: eventAlias }
  return { kind: 'event_member', memberId: eventMember.id, text: eventMember.name }
}

function subjectError(message, code) {
  return Object.assign(new Error(message), { status: 409, code })
}

export function resolveFactSubjects(rawInput, facts, eventMember, members) {
  if (!eventMember) throw subjectError('记录对象不存在，请重新选择人物。', 'SUBJECT_MEMBER_NOT_FOUND')
  if (ambiguousSubject.test(String(rawInput ?? ''))) throw subjectError('请说明这条健康情况属于哪位家庭成员。', 'SUBJECT_NEEDS_CONFIRMATION')
  const resolved = facts.map((fact) => {
    const subject = subjectForText(fact.sourceText || fact.originalText || rawInput, eventMember, members)
    return { fact, subject }
  })
  const meaningful = resolved.filter(({ fact }) => healthSignal.test(fact.sourceText || fact.originalText || fact.name || ''))
  const memberIds = [...new Set(meaningful.map(({ subject }) => subject.memberId).filter(Boolean))]
  if (meaningful.some(({ subject }) => ['ambiguous', 'multiple'].includes(subject.kind))) {
    throw subjectError('请说明每条健康情况属于哪位家庭成员。', 'SUBJECT_NEEDS_CONFIRMATION')
  }
  if (memberIds.length > 1) {
    throw subjectError('这段话包含多个人的情况，请分别记录。', 'MULTIPLE_SUBJECTS_NEED_SPLIT')
  }
  if (memberIds.length === 1 && memberIds[0] !== eventMember.id) {
    throw subjectError(`这条情况不属于${eventMember.name}，请切换到正确的记录对象。`, 'SUBJECT_MEMBER_MISMATCH')
  }
  return resolved.map(({ fact, subject }) => ({
    ...fact,
    subject: 'event_subject',
    subjectMemberId: eventMember.id,
    subjectKind: subject.kind,
    subjectText: subject.text || eventMember.name
  }))
}
