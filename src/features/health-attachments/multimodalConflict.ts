import type { EventAttachmentPreviewApiDto, HealthFact } from '../../types'

export interface MultimodalConflict {
  concept: string
  textValue: string
  imageValue: string
  textSource: '用户描述'
  imageSource: '图片识别'
}

const valueFor = (fact: HealthFact) => fact.type === 'temperature'
  ? String(fact.temperature?.max ?? fact.value ?? '')
  : fact.type === 'medication' ? fact.name.replace(/\s*[\d.]+\s*(?:毫升|ml|片|粒).*/i, '') : ''

export function findMultimodalConflicts(textFacts: readonly HealthFact[], imageDrafts: readonly EventAttachmentPreviewApiDto[]) {
  const imageFacts = imageDrafts.flatMap((draft) => draft.analysis.extractedFacts ?? [])
  const conflicts: MultimodalConflict[] = []
  for (const textFact of textFacts) {
    if (!['temperature', 'medication'].includes(textFact.type) || textFact.polarity === 'negated') continue
    for (const imageFact of imageFacts.filter((item) => item.type === textFact.type)) {
      const textValue = valueFor(textFact)
      const imageValue = valueFor(imageFact)
      if (!textValue || !imageValue || textValue === imageValue) continue
      conflicts.push({ concept: textFact.type === 'temperature' ? '体温' : '药品', textValue, imageValue, textSource: '用户描述', imageSource: '图片识别' })
    }
  }
  return conflicts
}
