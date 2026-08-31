import { normalizeHealthAIOutput } from './ai-types.mjs'

function contextError(message, code = 'AMBIGUOUS_HEALTH_CONTEXT') {
  return Object.assign(new Error(message), { status: 409, code })
}

function latestFacts(organizations) {
  return organizations
    .slice()
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .flatMap((item) => item.healthAIOutput?.facts ?? [])
}

function activeSymptoms(facts) {
  const state = new Map()
  for (const fact of facts) {
    if (fact.type === 'symptom') state.set(fact.name, { fact, active: fact.polarity === 'affirmed' && fact.status !== 'resolved' })
    if (fact.type === 'status_change' && fact.target) {
      const current = state.get(fact.target)
      if (current) state.set(fact.target, { fact: current.fact, active: !['resolved'].includes(fact.change) })
    }
  }
  return [...state.values()].filter((item) => item.active).map((item) => item.fact)
}

function resolvedSymptoms(facts) {
  const resolved = []
  for (const fact of facts) {
    if (fact.type === 'status_change' && fact.change === 'resolved' && fact.target) {
      const target = [...facts].reverse().find((item) => item.type === 'symptom' && item.name === fact.target)
      if (target) resolved.push(target)
    }
  }
  return resolved
}

function stateChangeFact(rawInput, target, change, time) {
  const label = { persistent: '持续', improved: '好转', recurred: '复发', resolved: '消失' }[change]
  return {
    id: `context-${change}-${Date.now()}`,
    type: 'status_change', category: 'status_change', concept: target.name, name: `${target.name}${label}`,
    bodyPart: target.bodyPart ?? null, originalText: rawInput, sourceText: rawInput,
    polarity: 'affirmed', temporality: 'current', status: change === 'resolved' ? 'resolved' : change === 'improved' ? 'improving' : change === 'recurred' ? 'recurrent' : 'active',
    subject: 'event_subject', source: 'user_report', assertionType: 'state_change', target: target.name, change,
    targetFactId: target.id, time, confidence: 0.96
  }
}

export function applyEventHealthContext(rawInput, output, organizations, options = {}) {
  const facts = latestFacts(organizations)
  const current = activeSymptoms(facts)
  const raw = String(rawInput ?? '').trim()
  const semanticRaw = raw.replace(/[。！!？?]+$/g, '')
  const normalized = normalizeHealthAIOutput(output)
  const isAmbiguous = /^(?:这个|它)(?:还在|好一点|轻一点|又有了|没了)?/.test(semanticRaw)
  const onlyGenericChange = normalized.facts.length === 0 || normalized.facts.every((fact) => fact.type === 'status_change' && (!fact.target || fact.target === '当前症状'))
  if (isAmbiguous && onlyGenericChange) throw contextError('请说明是哪一个症状发生了变化。')
  if (normalized.facts.length) {
    const genericPain = normalized.facts.length === 1 && normalized.facts[0].type === 'symptom' && normalized.facts[0].name === '疼痛' && !normalized.facts[0].bodyPart
    const activePain = current.filter((fact) => /疼|痛/.test(fact.name))
    if (genericPain && activePain.length === 1 && /还是疼|差不多|没有变化/.test(raw)) {
      const time = normalized.facts[0].time
      return normalizeHealthAIOutput({ ...normalized, facts: [stateChangeFact(raw, activePain[0], 'persistent', time)] })
    }
    const hasStateChange = normalized.facts.some((fact) => fact.type === 'status_change')
    const enriched = normalized.facts.map((fact) => {
      if (fact.type === 'status_change' && (!fact.target || fact.target === '当前症状' || fact.target === '疼痛')) {
        const candidates = fact.target === '疼痛' ? current.filter((item) => /疼|痛/.test(item.name)) : current
        const unique = [...new Map(candidates.map((item) => [item.name, item])).values()]
        if (unique.length !== 1) throw contextError('请说明是哪一个症状发生了变化。')
        return { ...fact, target: unique[0].name, name: `${unique[0].name}${fact.name.replace(/^当前症状/, '')}`, targetFactId: unique[0].id }
      }
      if (fact.assertionType !== 'correction' && !/不对|说错|记错/.test(raw)) return fact
      const prior = [...facts].reverse().find((item) => item.type === fact.type && item.name === fact.name && item.id !== fact.id)
        ?? [...facts].reverse().find((item) => fact.type === 'temperature' ? item.type === 'temperature' : item.type === 'symptom')
      return prior ? { ...fact, revisionOfFactId: prior.id, targetFactId: prior.id, status: 'active' } : fact
    })
    return normalizeHealthAIOutput({
      ...normalized,
      facts: enriched.filter((fact) => !(hasStateChange && fact.type === 'symptom' && fact.name === '疼痛' && !fact.bodyPart))
    })
  }

  const requestedChange = /^(?:现在)?(?:还在|还是这样|没有变化)$/.test(semanticRaw) ? 'persistent'
    : /^(?:现在)?(?:轻一点了?|好一点了?|轻多了|没有之前严重)$/.test(semanticRaw) ? 'improved'
      : /^(?:晚上|下午|现在)?(?:又有了|又出现了|复发了)$/.test(semanticRaw) ? 'recurred'
        : null
  if (requestedChange) {
    const candidates = requestedChange === 'recurred' ? resolvedSymptoms(facts) : current
    const unique = [...new Map(candidates.map((fact) => [fact.name, fact])).values()]
    if (unique.length !== 1) throw contextError('请说明是哪一个症状发生了变化。')
    const time = options.timeResolver.resolve(null, {
      selectedOccurredAt: options.selectedOccurredAt,
      timezone: options.timezone,
      referenceNow: options.referenceNow
    })
    return normalizeHealthAIOutput({ ...normalized, facts: [stateChangeFact(raw, unique[0], requestedChange, time)] })
  }

  const timeCorrection = /(?:今天早上|今天|昨晚|昨天|前天).*不对.*(?:是)?\s*(昨晚|昨天|前天|今天(?:早上)?)/.exec(raw)
  if (timeCorrection) {
    const target = facts.at(-1)
    if (!target) throw contextError('没有找到需要纠正的上一条健康事实。', 'CORRECTION_TARGET_NOT_FOUND')
    const time = options.timeResolver.resolve(timeCorrection[1], {
      selectedOccurredAt: options.selectedOccurredAt,
      timezone: options.timezone,
      referenceNow: options.referenceNow
    })
    return normalizeHealthAIOutput({ ...normalized, facts: [{
      ...target, id: `context-correction-${Date.now()}`, sourceText: raw, originalText: raw,
      assertionType: 'correction', revisionOfFactId: target.id, targetFactId: target.id, time
    }] })
  }
  const sideCorrection = /(?:不对|说错了|记错了).*(右|左)(?:侧)?(胳膊|手|腿|脚|肩|小腿)/.exec(raw)
  if (sideCorrection) {
    const target = [...facts].reverse().find((fact) => fact.type === 'symptom')
    if (!target) throw contextError('没有找到需要纠正的上一条健康事实。', 'CORRECTION_TARGET_NOT_FOUND')
    const bodyPart = `${sideCorrection[1]}${sideCorrection[2]}`
    return normalizeHealthAIOutput({ ...normalized, facts: [{
      ...target, id: `context-correction-${Date.now()}`, bodyPart,
      bodyRegion: sideCorrection[2], laterality: sideCorrection[1] === '右' ? 'right' : 'left',
      sourceText: raw, originalText: raw, assertionType: 'correction',
      revisionOfFactId: target.id, targetFactId: target.id
    }] })
  }
  const continuedCount = /(?:拉|吐)(?:了)?([一二两三四五六七八九十\d]+)次/.exec(raw)
  if (continuedCount) {
    const target = [...current].reverse().find((fact) => fact.name === '腹泻' || fact.name === '呕吐')
    if (target) {
      const numberMap = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
      const count = Number(continuedCount[1]) || numberMap[continuedCount[1]]
      const time = options.timeResolver.resolve(null, options)
      return normalizeHealthAIOutput({ ...normalized, facts: [{
        ...target, id: `context-count-${Date.now()}`, sourceText: raw, originalText: raw,
        occurrenceCount: count, time, assertionType: 'observation'
      }] })
    }
  }
  return normalized
}
