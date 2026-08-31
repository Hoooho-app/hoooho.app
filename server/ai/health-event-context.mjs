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
    if (fact.type === 'symptom' && fact.polarity === 'negated' && fact.status === 'resolved') resolved.push(fact)
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

function sameSymptom(left, right) {
  if (!left || !right) return false
  if (left === right) return true
  const normalized = (value) => String(value).replaceAll(/(?:咽喉|喉咙|嗓子)/g, '咽喉').replaceAll(/(?:肚子|腹部)/g, '腹')
  return normalized(left) === normalized(right)
    || (/疼痛/.test(left) && /疼|痛/.test(right))
    || (/疼痛/.test(right) && /疼|痛/.test(left))
}

function candidatesForState(fact, current, resolved, raw) {
  if (fact.change === 'recurred') return resolved
  if (/体温(?:已经)?正常|不烧|退烧/.test(fact.sourceText ?? raw)) return current.filter((item) => item.name === '发热')
  const bodyPart = fact.bodyPart
  if (bodyPart) {
    const bodyMatches = current.filter((item) => item.bodyPart && (item.bodyPart.includes(bodyPart) || bodyPart.includes(item.bodyPart)))
    if (bodyMatches.length) return bodyMatches
  }
  if (fact.target && !['当前症状', '疼痛'].includes(fact.target)) {
    const named = current.filter((item) => sameSymptom(item.name, fact.target))
    if (named.length) return named
  }
  if (fact.target === '疼痛') {
    const explicit = /头/.test(fact.sourceText ?? '') ? current.filter((item) => item.name === '头痛')
      : /肚子|腹/.test(fact.sourceText ?? '') ? current.filter((item) => item.name === '腹痛')
        : current.filter((item) => /疼|痛/.test(item.name))
    if (explicit.length) return explicit
  }
  return current
}

export function applyEventHealthContext(rawInput, output, organizations, options = {}) {
  const facts = latestFacts(organizations)
  const current = activeSymptoms(facts)
  const raw = String(rawInput ?? '').trim()
  const semanticRaw = raw.replace(/[。！!？?]+$/g, '')
  const semanticActionRaw = semanticRaw.replace(/^\d{1,2}月\d{1,2}[日号]?(?:凌晨|早上|上午|中午|下午|晚上|夜里)?/, '')
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
      if (fact.type === 'status_change' && fact.change !== 'corrected' && (!fact.target || fact.target === '当前症状' || fact.target === '疼痛')) {
        const candidates = candidatesForState(fact, current, resolvedSymptoms(facts), raw)
        const unique = [...new Map(candidates.map((item) => [item.name, item])).values()]
        if (unique.length !== 1) {
          if (fact.change === 'unchanged' && unique.length === 0) return fact
          throw contextError('请说明是哪一个症状发生了变化。')
        }
        return { ...fact, target: unique[0].name, name: `${unique[0].name}${fact.name.replace(/^当前症状/, '')}`, targetFactId: unique[0].id }
      }
      if (fact.type === 'symptom' && fact.occurrenceCount) {
        const prior = [...facts].reverse().find((item) => item.type === 'symptom' && item.name === fact.name && item.polarity === 'affirmed')
        if (prior?.occurrenceCount) {
          const change = /又/.test(raw) ? 'recurred' : /还没有完全好/.test(raw) ? 'persistent' : fact.occurrenceCount < prior.occurrenceCount ? 'improved' : 'persistent'
          return {
            ...stateChangeFact(raw, prior, change, fact.time),
            occurrenceCount: fact.occurrenceCount,
            frequency: fact.frequency,
            severity: fact.severity,
            severityScale: fact.severityScale
          }
        }
      }
      if (fact.type === 'symptom' && fact.polarity === 'negated' && fact.name === '疼痛' && !fact.bodyPart) {
        const activePain = current.filter((item) => /疼|痛/.test(item.name))
        if (activePain.length === 1) return {
          ...fact,
          name: activePain[0].name,
          concept: activePain[0].name,
          bodyPart: activePain[0].bodyPart,
          bodyRegion: activePain[0].bodyRegion,
          laterality: activePain[0].laterality,
          status: 'resolved',
          targetFactId: activePain[0].id
        }
      }
      if (fact.type === 'status_change' && fact.target && !fact.targetFactId) {
        const prior = [...facts].reverse().find((item) => item.type === 'symptom' && item.name === fact.target)
          ?? [...facts].reverse().find((item) => fact.target === '发热' && item.type === 'temperature')
        if (prior) return { ...fact, targetFactId: prior.id }
      }
      if (fact.assertionType !== 'correction' && !/不对|说错|记错/.test(raw)) return fact
      const prior = [...facts].reverse().find((item) => item.type === fact.type && item.name === fact.name && item.id !== fact.id)
        ?? [...facts].reverse().find((item) => fact.type === 'temperature' ? item.type === 'temperature' : item.type === 'symptom')
      return prior ? { ...fact, revisionOfFactId: prior.id, targetFactId: prior.id, status: 'active' } : fact
    })
    const withAttributes = enriched.map((fact) => {
      if (fact.type !== 'status_change') return fact
      const observation = enriched.find((candidate) => candidate.type === 'symptom' && sameSymptom(candidate.name, fact.target))
      return observation ? {
        ...fact,
        frequency: fact.frequency ?? observation.frequency,
        occurrenceCount: fact.occurrenceCount ?? observation.occurrenceCount,
        severity: fact.severity ?? observation.severity,
        severityScale: fact.severityScale ?? observation.severityScale
      } : fact
    })
    const distinct = withAttributes.filter((fact, index) => fact.type !== 'status_change' || withAttributes.findIndex((candidate) => (
      candidate.type === 'status_change' && candidate.change === fact.change && sameSymptom(candidate.target, fact.target)
      && (candidate.bodyPart ?? null) === (fact.bodyPart ?? null)
    )) === index)
    return normalizeHealthAIOutput({
      ...normalized,
      facts: distinct.filter((fact) => {
        if (!hasStateChange || fact.type !== 'symptom') return true
        const priorExists = facts.some((prior) => prior.type === 'symptom' && sameSymptom(prior.name, fact.name))
        const matchingState = distinct.find((candidate) => candidate.type === 'status_change' && sameSymptom(candidate.target, fact.name)
          && (!candidate.bodyPart || !fact.bodyPart || candidate.bodyPart === fact.bodyPart))
        if (!matchingState) return true
        if (matchingState.change === 'corrected') return true
        if (fact.polarity === 'negated') return !priorExists
        if (fact.polarity !== 'affirmed') return true
        return !(priorExists || matchingState.change !== 'persistent')
      })
    })
  }

  const requestedChange = /^(?:现在)?(?:还在|还是这样|没有变化)$/.test(semanticActionRaw) ? 'persistent'
    : /^(?:现在)?(?:轻一点了?|好一点了?|轻多了|没有之前严重)$/.test(semanticActionRaw) ? 'improved'
      : /^(?:晚上|下午|现在)?(?:又有了|又出现了|复发了)$/.test(semanticActionRaw) ? 'recurred'
        : null
  if (requestedChange) {
    const candidates = requestedChange === 'recurred' ? resolvedSymptoms(facts) : current
    const unique = [...new Map(candidates.map((fact) => [fact.name, fact])).values()]
    if (unique.length !== 1) throw contextError('请说明是哪一个症状发生了变化。')
    const mentionedTime = raw.match(/^\d{1,2}月\d{1,2}[日号]?(?:凌晨|早上|上午|中午|下午|晚上|夜里)?/)?.[0] ?? null
    const time = options.timeResolver.resolve(mentionedTime, {
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
      ...target, id: `context-correction-${Date.now()}`, type: 'status_change', category: 'status_change',
      name: `${target.name}已纠正`, concept: target.name, target: target.name, change: 'corrected', bodyPart,
      bodyRegion: sideCorrection[2], laterality: sideCorrection[1] === '右' ? 'right' : 'left',
      sourceText: raw, originalText: raw, assertionType: 'correction',
      status: 'corrected', revisionOfFactId: target.id, targetFactId: target.id
    }] })
  }
  const continuedCount = /(?:拉|吐)(?:了)?([一二两三四五六七八九十\d]+)次/.exec(raw)
  if (continuedCount) {
    const target = [...current].reverse().find((fact) => fact.name === '腹泻' || fact.name === '呕吐')
    if (target) {
      const numberMap = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
      const count = Number(continuedCount[1]) || numberMap[continuedCount[1]]
      const time = options.timeResolver.resolve(null, options)
      const previousCount = Number(target.occurrenceCount ?? target.count)
      const change = Number.isFinite(previousCount) && count < previousCount ? (/还没有完全好/.test(raw) ? 'persistent' : 'improved') : null
      return normalizeHealthAIOutput({ ...normalized, facts: [change ? {
        ...stateChangeFact(raw, target, change, time), occurrenceCount: count
      } : {
        ...target, id: `context-count-${Date.now()}`, sourceText: raw, originalText: raw,
        occurrenceCount: count, time, assertionType: 'observation'
      }] })
    }
  }
  return normalized
}
