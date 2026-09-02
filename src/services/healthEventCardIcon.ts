import type { HealthEventCardIconKind, HealthEventCardIconPresentation, HealthEventCardSummaryFragment, HealthEventCategory } from '../types'

interface HealthEventCardIconInput {
  category: HealthEventCategory
  displayTitle: string
  fallbackTexts?: readonly string[]
  structuredBodyParts?: readonly string[]
  summaryFragments?: readonly HealthEventCardSummaryFragment[]
}

const bodyRegionRules: Array<{ kind: HealthEventCardIconKind; label: string; pattern: RegExp }> = [
  { kind: 'head', label: '头部', pattern: /头|脑|额|太阳穴|眼|耳|鼻/ },
  { kind: 'neck', label: '颈部', pattern: /颈|脖|咽|喉|嗓/ },
  { kind: 'chest', label: '胸部', pattern: /胸|心口|心前区/ },
  { kind: 'abdomen', label: '腹部', pattern: /腹|肚|胃|肠|肚脐/ },
  { kind: 'waist', label: '腰背部', pattern: /腰|背/ },
  { kind: 'arm', label: '手臂', pattern: /肩|手臂|胳膊|上臂|前臂|肘/ },
  { kind: 'hand', label: '手部', pattern: /手腕|手掌|手指|手部|手(?:疼|痛|麻|肿|不适|不舒服)/ },
  { kind: 'leg', label: '腿部', pattern: /大腿|小腿|膝|腿/ },
  { kind: 'foot', label: '脚部', pattern: /脚踝|脚掌|脚趾|足|脚/ }
]

const eventTypeRules: Array<{ kind: HealthEventCardIconKind; label: string; pattern: RegExp }> = [
  { kind: 'medication', label: '用药随记', pattern: /用药|服药|药物|药品|药片|药膏/ },
  { kind: 'examination', label: '检查随记', pattern: /检查|化验|检验|血常规|影像|CT|核磁|超声/i },
  { kind: 'visit', label: '就诊随记', pattern: /就诊|看医生|医院|门诊|急诊/ },
  { kind: 'surgery', label: '手术随记', pattern: /手术|术后|术前/ },
  { kind: 'report', label: '报告随记', pattern: /报告|报告单/ }
]

function uniqueRegions(values: readonly string[]) {
  const found = new Map<HealthEventCardIconKind, string>()
  values.forEach((value) => {
    bodyRegionRules.forEach((rule) => {
      if (rule.pattern.test(value)) found.set(rule.kind, rule.label)
    })
  })
  return [...found.entries()].map(([kind, label]) => ({ kind, label }))
}

function presentation(kind: HealthEventCardIconKind, label: string, source: HealthEventCardIconPresentation['source']): HealthEventCardIconPresentation {
  return { kind, label, source }
}

export function getHealthEventCardIconPresentation({
  category,
  displayTitle,
  fallbackTexts = [],
  structuredBodyParts = [],
  summaryFragments = []
}: HealthEventCardIconInput): HealthEventCardIconPresentation {
  const explicitParts = structuredBodyParts.map((part) => part.trim()).filter(Boolean)
  if (explicitParts.length > 0) {
    const regions = uniqueRegions(explicitParts)
    if (regions.length === 1) return presentation(regions[0].kind, regions[0].label, 'structured')
    if (regions.length > 1 || explicitParts.length > 1) return presentation('combined', '多部位或组合症状', 'structured')
    return presentation('general', '综合健康随记', 'structured')
  }

  const labels = [displayTitle, ...fallbackTexts, ...summaryFragments.map(({ label }) => label)].map((label) => label.trim()).filter(Boolean)
  const regions = uniqueRegions(labels)
  if (regions.length > 1) return presentation('combined', '多部位或组合症状', 'semantic-fallback')

  const symptomLabels = new Set(summaryFragments
    .filter(({ kind }) => kind === 'symptom')
    .map(({ label }) => label.trim())
    .filter(Boolean))
  if (symptomLabels.size > 1) return presentation('combined', '多部位或组合症状', 'semantic-fallback')
  if (regions.length === 1) return presentation(regions[0].kind, regions[0].label, 'semantic-fallback')

  const combinedText = labels.join(' ')
  const eventType = eventTypeRules.find(({ pattern }) => pattern.test(combinedText))
  if (eventType) return presentation(eventType.kind, eventType.label, 'semantic-fallback')
  if (/发热|发烧|过敏|皮疹|全身|综合|多处/.test(combinedText)) {
    return presentation('combined', '全身或组合症状', 'semantic-fallback')
  }

  const categoryFallback: Partial<Record<HealthEventCategory, HealthEventCardIconPresentation>> = {
    allergy: presentation('combined', '全身或组合症状', 'semantic-fallback')
  }
  return categoryFallback[category] ?? presentation('general', '综合健康随记', 'general')
}
