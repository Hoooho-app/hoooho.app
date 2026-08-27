import { FamilyMemberRepository } from './repositories/family-member-repository.mjs'
import { localDateKey } from '../time/local-calendar.mjs'

const relationships = new Set(['child', 'parent', 'spouse', 'other'])
const genders = new Set(['male', 'female', 'undisclosed'])
const editableFields = new Set([
  'name', 'relationship', 'gender', 'birthday', 'avatar',
  'heightCm', 'weightKg', 'bloodType', 'waistCircumferenceCm',
  'bodyFatPercentage', 'headCircumferenceCm', 'rhBloodType'
])
const bloodTypes = new Set(['A', 'B', 'AB', 'O'])
const rhBloodTypes = new Set(['positive', 'negative'])

export class FamilyMemberError extends Error {
  constructor(message, status = 400, code = 'MEMBER_ERROR') {
    super(message)
    this.status = status
    this.code = code
  }
}

function validateName(value) {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name || name.length > 50) throw new FamilyMemberError('成员名称应为 1–50 个字符', 400, 'INVALID_MEMBER_NAME')
  return name
}

function validateRelationship(value) {
  if (!relationships.has(value)) {
    throw new FamilyMemberError('家庭关系必须是 child、parent、spouse 或 other', 400, 'INVALID_RELATIONSHIP')
  }
  return value
}

function validateGender(value) {
  if (value === undefined || value === null || value === '') return null
  if (!genders.has(value)) throw new FamilyMemberError('性别字段格式错误', 400, 'INVALID_GENDER')
  return value
}

function validateBirthday(value, now = new Date(), timeZone) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}(?:-\d{2}-\d{2})?$/.test(value)) {
    throw new FamilyMemberError('出生日期格式应为 YYYY 或 YYYY-MM-DD', 400, 'INVALID_BIRTHDAY')
  }
  if (/^\d{4}$/.test(value)) {
    if (value > String(localDateKey(now, timeZone)).slice(0, 4)) {
      throw new FamilyMemberError('请输入有效且不晚于今年的出生年份', 400, 'INVALID_BIRTHDAY')
    }
    return value
  }
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value || value > localDateKey(now, timeZone)) {
    throw new FamilyMemberError('请输入有效且不晚于今天的出生日期', 400, 'INVALID_BIRTHDAY')
  }
  return value
}

function validateAvatar(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || value.length > 300_000) throw new FamilyMemberError('头像字段格式错误', 400, 'INVALID_AVATAR')
  if (value.length > 500 && !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new FamilyMemberError('头像字段格式错误', 400, 'INVALID_AVATAR')
  }
  return value
}

function validateOptionalNumber(value, label, min, max) {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new FamilyMemberError(`${label}格式错误`, 400, `INVALID_${label === '身高' ? 'HEIGHT' : 'WEIGHT'}`)
  }
  return Math.round(number * 10) / 10
}

function validateBloodType(value) {
  if (value === undefined || value === null || value === '') return null
  if (!bloodTypes.has(value)) throw new FamilyMemberError('血型字段格式错误', 400, 'INVALID_BLOOD_TYPE')
  return value
}

function validateRhBloodType(value) {
  if (value === undefined || value === null || value === '') return null
  if (!rhBloodTypes.has(value)) throw new FamilyMemberError('Rh(D) 血型字段格式错误', 400, 'INVALID_RH_BLOOD_TYPE')
  return value
}

export class FamilyMemberService {
  constructor(options = {}) {
    this.repository = options.repository ?? new FamilyMemberRepository(options.dataDirectory)
  }

  async list(accountId) {
    return this.repository.findByAccountId(accountId)
  }

  async get(accountId, id) {
    const member = await this.repository.findById(id)
    if (!member || member.accountId !== accountId) throw new FamilyMemberError('家庭成员不存在', 404, 'MEMBER_NOT_FOUND')
    return member
  }

  async create(accountId, input, now = new Date(), timeZone) {
    return this.repository.create({
      accountId,
      name: validateName(input.name),
      relationship: validateRelationship(input.relationship),
      gender: validateGender(input.gender),
      birthday: validateBirthday(input.birthday, now, timeZone),
      avatar: validateAvatar(input.avatar),
      isSelf: false
    }, now)
  }

  async update(accountId, id, input, now = new Date(), timeZone) {
    const member = await this.get(accountId, id)
    const changes = {}
    for (const key of Object.keys(input)) {
      if (!editableFields.has(key)) continue
      if (key === 'name') changes.name = validateName(input.name)
      if (key === 'relationship') {
        if (member.isSelf) throw new FamilyMemberError('本人关系不能修改', 400, 'SELF_RELATIONSHIP_IMMUTABLE')
        changes.relationship = validateRelationship(input.relationship)
      }
      if (key === 'gender') changes.gender = validateGender(input.gender)
      if (key === 'birthday') changes.birthday = validateBirthday(input.birthday, now, timeZone)
      if (key === 'avatar') changes.avatar = validateAvatar(input.avatar)
      if (key === 'heightCm') changes.heightCm = validateOptionalNumber(input.heightCm, '身高', 20, 260)
      if (key === 'weightKg') changes.weightKg = validateOptionalNumber(input.weightKg, '体重', 1, 500)
      if (key === 'bloodType') changes.bloodType = validateBloodType(input.bloodType)
      if (key === 'waistCircumferenceCm') changes.waistCircumferenceCm = validateOptionalNumber(input.waistCircumferenceCm, '腰围', 1, 300)
      if (key === 'bodyFatPercentage') changes.bodyFatPercentage = validateOptionalNumber(input.bodyFatPercentage, '体脂率', 0, 100)
      if (key === 'headCircumferenceCm') changes.headCircumferenceCm = validateOptionalNumber(input.headCircumferenceCm, '头围', 1, 100)
      if (key === 'rhBloodType') changes.rhBloodType = validateRhBloodType(input.rhBloodType)
    }
    if (!Object.keys(changes).length) throw new FamilyMemberError('没有可更新的成员字段', 400, 'NO_MEMBER_CHANGES')
    return this.repository.update(id, changes, now)
  }

  async delete(accountId, id) {
    const member = await this.get(accountId, id)
    if (member.isSelf) throw new FamilyMemberError('不能删除本人家庭成员', 400, 'CANNOT_DELETE_SELF')
    await this.repository.delete(id)
    return { success: true }
  }
}
