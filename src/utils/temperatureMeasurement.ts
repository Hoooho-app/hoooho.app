export function getExactTemperatureMeasurement(min: number, max: number) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min !== max) return null
  return min
}
