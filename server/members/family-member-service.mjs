import { FamilyMemberRepository } from './repositories/family-member-repository.mjs'
import { localDateKey } from '../time/local-calendar.mjs'
import sharp from 'sharp'
import {
  AVATAR_PHOTO_MAX_BINARY_BYTES,
  AVATAR_PHOTO_MAX_DATA_URL_LENGTH,
  AVATAR_PHOTO_MIME_TYPES
} from '../../shared/avatar-photo-policy.mjs'
import { normalizeChildCaregivers, parsePlainDateKey, validateChildBirthdayKey } from '../../shared/child-profile-policy.mjs'

const relationships = new Set(['child', 'parent', 'spouse', 'other'])
const genders = new Set(['male', 'female', 'undisclosed'])
const editableFields = new Set([
  'name', 'relationship', 'gender', 'birthday', 'avatar',
  'heightCm', 'weightKg', 'bloodType', 'waistCircumferenceCm',
  'bodyFatPercentage', 'headCircumferenceCm', 'rhBloodType',
  'caregivers', 'otherRelative', 'otherCaregiver'
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
    const currentYear = Number(String(localDateKey(now, timeZone)).slice(0, 4))
    if (Number(value) > currentYear || Number(value) < currentYear - 120) {
      throw new FamilyMemberError('请输入最近 120 年内且不晚于今年的出生年份', 400, 'INVALID_BIRTHDAY')
    }
    return value
  }
  const maximum = localDateKey(now, timeZone)
  const maximumParts = maximum.split('-').map(Number)
  const minimumDay = maximumParts[1] === 2 && maximumParts[2] === 29 ? 28 : maximumParts[2]
  const minimum = `${String(maximumParts[0] - 120).padStart(4, '0')}-${String(maximumParts[1]).padStart(2, '0')}-${String(minimumDay).padStart(2, '0')}`
  if (!parsePlainDateKey(value) || value > maximum || value < minimum) {
    throw new FamilyMemberError('请输入有效且不晚于今天的出生日期', 400, 'INVALID_BIRTHDAY')
  }
  return value
}

function validateBirthdayForRelationship(value, relationship, now = new Date(), timeZone) {
  const birthday = validateBirthday(value, now, timeZone)
  if (relationship !== 'child' || birthday === null) return birthday
  const validation = validateChildBirthdayKey(birthday, localDateKey(now, timeZone))
  if (!validation.valid) {
    throw new FamilyMemberError(
      validation.error === 'too-old' ? '孩子应尚未满8周岁' : '请输入有效且不晚于今天的出生日期',
      400,
      'INVALID_CHILD_BIRTHDAY'
    )
  }
  return birthday
}

function validateCaregivers(value) {
  if (value === undefined || value === null) return []
  const caregivers = normalizeChildCaregivers(value)
  if (!caregivers) throw new FamilyMemberError('主要照顾者格式错误', 400, 'INVALID_CAREGIVERS')
  return caregivers
}

function validateCaregiverLabel(value, label) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new FamilyMemberError(`${label}格式错误`, 400, 'INVALID_CAREGIVER_LABEL')
  const normalized = value.trim()
  if (!normalized) return null
  if (normalized.length > 30) throw new FamilyMemberError(`${label}最多30个字符`, 400, 'INVALID_CAREGIVER_LABEL')
  return normalized
}

async function validateAvatar(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || value.length > AVATAR_PHOTO_MAX_DATA_URL_LENGTH) {
    throw new FamilyMemberError('头像字段格式错误', 400, 'INVALID_AVATAR')
  }
  if (!value.startsWith('data:')) {
    if (value.length > 500) throw new FamilyMemberError('头像字段格式错误', 400, 'INVALID_AVATAR')
    return value
  }

  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match || !AVATAR_PHOTO_MIME_TYPES.includes(match[1]) || match[2].length % 4 !== 0) {
    throw new FamilyMemberError('头像字段格式错误', 400, 'INVALID_AVATAR')
  }
  const buffer = Buffer.from(match[2], 'base64')
  if (!buffer.length || buffer.length > AVATAR_PHOTO_MAX_BINARY_BYTES) {
    throw new FamilyMemberError('头像字段格式错误', 400, 'INVALID_AVATAR')
  }

  try {
    const metadata = await sharp(buffer, { failOn: 'error', limitInputPixels: 4096 * 4096 }).metadata()
    const expectedFormat = match[1].slice('image/'.length)
    if (!metadata.width || !metadata.height || metadata.format !== expectedFormat) throw new Error('MIME mismatch')
  } catch {
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
    const relationship = validateRelationship(input.relationship)
    return this.repository.create({
      accountId,
      name: validateName(input.name),
      relationship,
      gender: validateGender(input.gender),
      birthday: validateBirthday(input.birthday, now, timeZone),
      avatar: await validateAvatar(input.avatar),
      caregivers: validateCaregivers(input.caregivers),
      otherRelative: validateCaregiverLabel(input.otherRelative, '其他亲属'),
      otherCaregiver: validateCaregiverLabel(input.otherCaregiver, '其他照看者'),
      isSelf: false
    }, now)
  }

  async createSelf(accountId, input = {}, now = new Date(), timeZone) {
    const existing = (await this.repository.findByAccountId(accountId)).find((member) => member.isSelf)
    const member = existing ?? await this.repository.ensureSelf(accountId, now)
    const changes = {}
    if (input.name !== undefined) changes.name = validateName(input.name)
    if (input.gender !== undefined) changes.gender = validateGender(input.gender)
    if (input.birthday !== undefined) changes.birthday = validateBirthday(input.birthday, now, timeZone)
    if (input.avatar !== undefined) changes.avatar = await validateAvatar(input.avatar)
    return Object.keys(changes).length ? this.repository.update(member.id, changes, now) : member
  }

  async update(accountId, id, input, now = new Date(), timeZone) {
    const member = await this.get(accountId, id)
    const changes = {}
    const targetRelationship = input.relationship === undefined
      ? member.relationship
      : validateRelationship(input.relationship)
    for (const key of Object.keys(input)) {
      if (!editableFields.has(key)) continue
      if (key === 'name') changes.name = validateName(input.name)
      if (key === 'relationship') {
        if (member.isSelf) throw new FamilyMemberError('本人关系不能修改', 400, 'SELF_RELATIONSHIP_IMMUTABLE')
        changes.relationship = targetRelationship
      }
      if (key === 'gender') changes.gender = validateGender(input.gender)
      if (key === 'birthday') changes.birthday = validateBirthdayForRelationship(input.birthday, targetRelationship, now, timeZone)
      if (key === 'avatar') changes.avatar = await validateAvatar(input.avatar)
      if (key === 'heightCm') changes.heightCm = validateOptionalNumber(input.heightCm, '身高', 20, 260)
      if (key === 'weightKg') changes.weightKg = validateOptionalNumber(input.weightKg, '体重', 1, 500)
      if (key === 'bloodType') changes.bloodType = validateBloodType(input.bloodType)
      if (key === 'waistCircumferenceCm') changes.waistCircumferenceCm = validateOptionalNumber(input.waistCircumferenceCm, '腰围', 1, 300)
      if (key === 'bodyFatPercentage') changes.bodyFatPercentage = validateOptionalNumber(input.bodyFatPercentage, '体脂率', 0, 100)
      if (key === 'headCircumferenceCm') changes.headCircumferenceCm = validateOptionalNumber(input.headCircumferenceCm, '头围', 1, 100)
      if (key === 'rhBloodType') changes.rhBloodType = validateRhBloodType(input.rhBloodType)
      if (key === 'caregivers') changes.caregivers = validateCaregivers(input.caregivers)
      if (key === 'otherRelative') changes.otherRelative = validateCaregiverLabel(input.otherRelative, '其他亲属')
      if (key === 'otherCaregiver') changes.otherCaregiver = validateCaregiverLabel(input.otherCaregiver, '其他照看者')
    }
    if (!Object.keys(changes).length) throw new FamilyMemberError('没有可更新的成员字段', 400, 'NO_MEMBER_CHANGES')
    return this.repository.update(id, changes, now)
  }

  async delete(accountId, id) {
    await this.get(accountId, id)
    await this.repository.delete(id)
    return { success: true }
  }
}
