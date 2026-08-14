export interface SmartTagOptions {
  maxTags?: number
  exclusiveValue?: string
}

export function normalizeSmartTags(values: readonly unknown[], maxTags = Number.POSITIVE_INFINITY) {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const value of values) {
    const tag = String(value ?? '').trim()
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    normalized.push(tag)
    if (normalized.length >= maxTags) break
  }

  return normalized
}

export function addSmartTag(values: readonly string[], rawTag: string, options: SmartTagOptions = {}) {
  const tag = rawTag.trim()
  if (!tag) return normalizeSmartTags(values, options.maxTags)

  const current = normalizeSmartTags(values)
  if (options.exclusiveValue && tag === options.exclusiveValue) return [tag]

  const withoutExclusive = options.exclusiveValue
    ? current.filter((value) => value !== options.exclusiveValue)
    : current

  return normalizeSmartTags([...withoutExclusive, tag], options.maxTags)
}

export function toggleSmartTag(values: readonly string[], tag: string, options: SmartTagOptions = {}) {
  const normalizedTag = tag.trim()
  if (!normalizedTag) return normalizeSmartTags(values, options.maxTags)
  if (values.includes(normalizedTag)) return values.filter((value) => value !== normalizedTag)
  return addSmartTag(values, normalizedTag, options)
}

export function shouldCommitSmartTag(key: string, isComposing: boolean) {
  return key === 'Enter' && !isComposing
}
