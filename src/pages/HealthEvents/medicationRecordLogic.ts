import type { JournalMedicationDetails, MedicationRoute } from '../../types/journal'

export const medicationUnits = ['mL', 'mg', 'g', '片', '粒', '袋', '滴', '揿', '支', '其他'] as const
export const medicationRoutes: Array<[MedicationRoute, string]> = [['oral', '口服'], ['topical', '外用'], ['nebulized', '雾化'], ['inhaled', '吸入'], ['nasal', '滴鼻'], ['ophthalmic', '滴眼'], ['other', '其他']]

export function medicationSummary(details: JournalMedicationDetails) {
  const route = medicationRoutes.find(([value]) => value === details.administrationRoute)?.[1] ?? '用药'
  const amount = details.amountValue && details.amountUnit ? `${details.amountValue} ${details.amountUnit}` : '用量未填写'
  const location = details.bodyLocations?.length ? `\n${details.bodyLocations.map((item) => `${item.label}${item.locationNumber}号区域`).join('、')}` : ''
  return `${route} · ${details.medicationName} · ${amount}${location}`
}

export function validMedicationAmount(value: string) {
  if (!value.trim()) return true
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0
}
