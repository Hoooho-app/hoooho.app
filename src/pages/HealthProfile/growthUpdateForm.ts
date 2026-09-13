export const heightStep = 0.1
export const weightStepGrams = 1

export function kgToGrams(value: number | null | undefined) {
  return value == null ? '' : String(Math.round(value * 1000))
}

export function gramsToKg(value: string) {
  return Math.round(Number(value) * 1000) / 1_000_000
}

export function validWeightGrams(value: string) {
  const number = Number(value.trim())
  return Number.isInteger(number) && number >= 1000 && number <= 500000
}

export function stepHeightValue(value: string, direction: 1 | -1, initialFloor: number | null) {
  const current = Number(value)
  if (!Number.isFinite(current)) return value
  if (direction < 0 && initialFloor != null && current <= initialFloor) return value
  const next = Math.round((current + direction * heightStep) * 10) / 10
  if (direction < 0 && initialFloor != null && next < initialFloor) return initialFloor.toFixed(1)
  return next >= 20 && next <= 260 ? next.toFixed(1) : value
}

export function stepWeightGramsValue(value: string, direction: 1 | -1) {
  const current = Number(value)
  if (!Number.isInteger(current)) return value
  const next = current + direction * weightStepGrams
  return next >= 1000 && next <= 500000 ? String(next) : value
}

export function formatSigned(value: number, digits = 1) {
  const rounded = Number(value.toFixed(digits))
  return `${rounded > 0 ? '+' : ''}${rounded}`
}
