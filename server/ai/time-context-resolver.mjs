import { TimeResolverService } from './time-resolver-service.mjs'

const periodExpression = '(?:凌晨|半夜|今早|早上|上午|中午|下午|晚上|夜里|夜间)'
const clockExpression = '(?:\\d{1,2}(?:点(?:(?:半)|\\d{1,2}分?)?|:\\d{1,2}))'
const timeSuffix = `(?:${periodExpression})?(?:${clockExpression})?`

const expressionMatchers = [
  new RegExp(`\\d{4}年(?:\\s*\\d{1,2}月(?:\\s*\\d{1,2}日?)?)?${timeSuffix}`),
  new RegExp(`(?:上周|本周|这周|周|星期)[一二三四五六日天]${timeSuffix}`),
  new RegExp(`(?:今天|昨天|前天|今朝)${timeSuffix}`),
  new RegExp(`昨晚(?:${clockExpression})?|\\d{1,2}月\\s*\\d{1,2}[日号]${timeSuffix}|前两天|前几个月|三年前|\\d{1,2}月初`),
  new RegExp(`(?:第二天|第三天|第四天|第五天|第六天|第七天|隔天)${timeSuffix}`),
  new RegExp(`${periodExpression}(?:${clockExpression})?|${clockExpression}`),
  /目前|现在|刚才|刚刚|上周|去年|小时候|几年前|\d+年前|以前|从前|很久以前|后来|之后/
]

function splitClauses(rawInput) {
  return rawInput.split(/[，、。；;！!？?\n]/).map((sourceText) => sourceText.trim()).filter(Boolean)
}

function findExpression(sourceText) {
  for (const matcher of expressionMatchers) {
    const match = matcher.exec(sourceText)
    if (match?.[0]) return match[0].trim()
  }
  return null
}

function isPeriodOnly(expression) {
  return Boolean(expression && new RegExp(`^(?:${periodExpression}|${clockExpression})$`).test(expression))
}

function sequenceDays(expression) {
  if (/第二天|隔天/.test(expression)) return 1
  if (/第三天/.test(expression)) return 2
  if (/第四天/.test(expression)) return 3
  if (/第五天/.test(expression)) return 4
  if (/第六天/.test(expression)) return 5
  if (/第七天/.test(expression)) return 6
  return null
}

function sequencePeriod(expression) {
  return expression.match(new RegExp(periodExpression))?.[0] ?? null
}

function withRaw(time, raw) {
  return { ...time, raw, source: 'user_text' }
}

function shiftedReference(resolvedStart, days) {
  const reference = new Date(resolvedStart)
  reference.setUTCDate(reference.getUTCDate() + days)
  return reference
}

function fuzzyRelation(raw) {
  return { raw, resolvedStart: null, resolvedEnd: null, precision: 'fuzzy', source: 'user_text' }
}

function contextsBySource(contexts) {
  const output = new Map()
  for (const context of contexts) {
    const existing = output.get(context.sourceText) ?? []
    existing.push(context)
    output.set(context.sourceText, existing)
  }
  return output
}

export class TimeContextResolver {
  constructor(options = {}) {
    this.timeResolver = options.timeResolver ?? new TimeResolverService()
  }

  resolveContexts(rawInput, options = {}) {
    const contexts = []
    let anchor = null

    for (const sourceText of splitClauses(rawInput)) {
      const expression = findExpression(sourceText)
      let time
      const days = sequenceDays(expression)

      if (days !== null && anchor?.resolvedStart) {
        const referenceNow = shiftedReference(anchor.resolvedStart, days)
        const period = sequencePeriod(expression)
        time = withRaw(this.timeResolver.resolve(period ?? '今天', { ...options, selectedOccurredAt: undefined, referenceNow }), expression)
      } else if (/^(?:后来|之后)$/.test(expression ?? '')) {
        time = fuzzyRelation(expression)
      } else if (isPeriodOnly(expression) && anchor?.resolvedStart) {
        time = this.timeResolver.resolve(expression, {
          ...options,
          selectedOccurredAt: undefined,
          referenceNow: new Date(anchor.resolvedStart)
        })
      } else if (expression) {
        time = this.timeResolver.resolve(expression, options)
      } else if (anchor) {
        time = { ...anchor }
      } else {
        time = this.timeResolver.resolve(null, options)
      }

      if (time.resolvedStart) anchor = time
      contexts.push({ sourceText, expression, time })
    }

    return contexts
  }

  resolveHealthAIOutput(rawInput, output, options = {}) {
    const facts = Array.isArray(output?.facts) ? output.facts : []
    const baseline = this.timeResolver.resolveHealthAIOutput(output, options)
    const contexts = this.resolveContexts(rawInput, options)
    const bySource = contextsBySource(contexts)

    return {
      ...baseline,
      facts: facts.map((fact, index) => {
        const exact = bySource.get(fact?.sourceText)?.[0]
        const partial = exact ?? contexts.find((context) => (
          fact?.sourceText?.includes(context.sourceText) || context.sourceText.includes(fact?.sourceText ?? '')
        ))
        return {
          ...baseline.facts[index],
          time: fact?.time?.raw && !partial?.time?.raw ? baseline.facts[index].time : partial?.time ?? baseline.facts[index].time
        }
      })
    }
  }
}
