import { GrowthMeasurementRepository } from './repositories/growth-measurement-repository.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'

export class GrowthMeasurementError extends Error {
  constructor(message, status = 400, code = 'GROWTH_MEASUREMENT_ERROR') { super(message); this.status = status; this.code = code }
}
const datePattern = /^\d{4}-\d{2}-\d{2}$/
function validDate(value, now = new Date()) {
  const normalized = String(value ?? '')
  if (!datePattern.test(normalized)) return false
  const [year, month, day] = normalized.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day && normalized <= now.toISOString().slice(0, 10)
}
function optionalNumber(value, label, min, max) {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) throw new GrowthMeasurementError(`${label}格式错误`, 400, label === '体重' ? 'INVALID_WEIGHT' : 'INVALID_HEIGHT')
  return Math.round(number * 10) / 10
}
export class GrowthMeasurementService {
  constructor(options = {}) {
    this.repository = options.repository ?? new GrowthMeasurementRepository(options.dataDirectory)
    this.members = options.members ?? new FamilyMemberRepository(options.dataDirectory)
  }
  async assertMember(accountId, memberId) {
    const member = await this.members.findById(memberId)
    if (!member || member.accountId !== accountId) throw new GrowthMeasurementError('家庭成员不存在', 404, 'MEMBER_NOT_FOUND')
    return member
  }
  async list(accountId, memberId) { await this.assertMember(accountId, memberId); return this.repository.list(accountId, memberId) }
  normalize(input, now, partial = false) {
    const result = {}
    if (!partial || input.measuredAt !== undefined) {
      if (!validDate(input.measuredAt, now)) throw new GrowthMeasurementError('请输入有效且不晚于今天的测量日期', 400, 'INVALID_MEASURED_AT')
      result.measuredAt = input.measuredAt
    }
    if (!partial || input.measurementType !== undefined) {
      if (!['length', 'height'].includes(input.measurementType)) throw new GrowthMeasurementError('测量类型格式错误', 400, 'INVALID_MEASUREMENT_TYPE')
      result.measurementType = input.measurementType
    }
    if (!partial || input.heightCm !== undefined) result.heightCm = optionalNumber(input.heightCm, '身长或身高', 20, 260)
    if (!partial || input.weightKg !== undefined) result.weightKg = optionalNumber(input.weightKg, '体重', 1, 500)
    if (!partial || input.dataStatus !== undefined) {
      const value = input.dataStatus ?? 'confirmed'
      if (!['confirmed', 'pending_confirmation'].includes(value)) throw new GrowthMeasurementError('数据状态格式错误', 400, 'INVALID_DATA_STATUS')
      result.dataStatus = value
    }
    if (!partial || input.standardId !== undefined) {
      const value = input.standardId ?? 'who-2006'
      if (value !== 'who-2006') throw new GrowthMeasurementError('参考标准暂不可用', 400, 'INVALID_STANDARD')
      result.standardId = value
    }
    if (!partial && result.heightCm == null && result.weightKg == null) throw new GrowthMeasurementError('请填写身长、身高或体重', 400, 'EMPTY_MEASUREMENT')
    return result
  }
  async upsert(accountId, input, now = new Date()) {
    await this.assertMember(accountId, String(input.memberId ?? ''))
    return this.repository.upsert({ accountId, memberId: input.memberId, ...this.normalize(input, now) }, now)
  }
  async update(accountId, id, input, now = new Date()) {
    const existing = await this.repository.findById(id)
    if (!existing || existing.accountId !== accountId) throw new GrowthMeasurementError('成长记录不存在', 404, 'GROWTH_MEASUREMENT_NOT_FOUND')
    const changes = this.normalize(input, now, true)
    const targetDate = changes.measuredAt ?? existing.measuredAt
    if ((await this.repository.list(accountId, existing.memberId)).some((item) => item.id !== id && item.measuredAt === targetDate)) throw new GrowthMeasurementError('该日期已有成长记录', 409, 'MEASUREMENT_DATE_EXISTS')
    return this.repository.update(id, changes, now)
  }
  async delete(accountId, id) {
    const existing = await this.repository.findById(id)
    if (!existing || existing.accountId !== accountId) throw new GrowthMeasurementError('成长记录不存在', 404, 'GROWTH_MEASUREMENT_NOT_FOUND')
    await this.repository.delete(id)
    return { success: true }
  }
}
