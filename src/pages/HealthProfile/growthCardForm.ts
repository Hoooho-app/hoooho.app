import type { BasicHealthProfileValues } from '../../features/health-profile/utils/healthProfileBasicInfo'

export const validHeight = (value: string | boolean | undefined) => { const number = Number(String(value ?? '').trim()); return Number.isFinite(number) && number >= 20 && number <= 260 }
export const validWeight = (value: string | boolean | undefined) => { const number = Number(String(value ?? '').trim()); return Number.isFinite(number) && number >= 1 && number <= 500 }
export const validAbo = (value: string | boolean | undefined) => ['A', 'B', 'AB', 'O'].includes(String(value ?? ''))
export const validRh = (value: string | boolean | undefined) => ['positive', 'negative', 'unknown'].includes(String(value ?? ''))

export function growthCardMissing(values: BasicHealthProfileValues) {
  return [!validHeight(values.height) && '身高', !validWeight(values.weight) && '体重'].filter(Boolean) as string[]
}

export function growthCardActionLabel(values: BasicHealthProfileValues, established: boolean, heightLabel = '身长') {
  const height = validHeight(values.height)
  const weight = validWeight(values.weight)
  if (height && weight) return '保存成长快照'
  if (height) return '再填体重，建立成长坐标'
  if (!height && (validAbo(values.aboBloodType) || validRh(values.rhBloodType))) return '保存血型'
  return established ? `填写${heightLabel}后即可更新` : `填写${heightLabel}后即可查看`
}
