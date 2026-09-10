import type { BasicHealthProfileValues } from '../../features/health-profile/utils/healthProfileBasicInfo'

export const validHeight = (value: string | boolean | undefined) => { const number = Number(String(value ?? '').trim()); return Number.isFinite(number) && number >= 20 && number <= 260 }
export const validWeight = (value: string | boolean | undefined) => { const number = Number(String(value ?? '').trim()); return Number.isFinite(number) && number >= 1 && number <= 500 }
export const validAbo = (value: string | boolean | undefined) => ['A', 'B', 'AB', 'O'].includes(String(value ?? ''))

export function growthCardMissing(values: BasicHealthProfileValues) {
  return [!validHeight(values.height) && '身高', !validWeight(values.weight) && '体重', !validAbo(values.aboBloodType) && '血型'].filter(Boolean) as string[]
}

export function growthCardActionLabel(values: BasicHealthProfileValues, established: boolean) {
  const missing = growthCardMissing(values)
  if (!missing.length) return established ? '更新成长数据' : '生成成长身份卡'
  return missing[0] === '血型' ? '选择血型后即可生成' : `填写${missing[0]}后即可生成`
}
