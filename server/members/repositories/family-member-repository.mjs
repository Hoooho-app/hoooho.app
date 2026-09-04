import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { JsonStore } from '../../auth/storage/json-store.mjs'

export class FamilyMemberRepository {
  #store

  constructor(dataDirectory) {
    this.#store = new JsonStore(path.join(dataDirectory, 'family-members.json'), { members: [] })
  }

  async create(input, now = new Date()) {
    const member = {
      id: randomUUID(),
      accountId: input.accountId,
      name: input.name,
      relationship: input.relationship,
      gender: input.gender ?? null,
      birthday: input.birthday ?? null,
      nationality: input.nationality ?? null,
      avatar: input.avatar ?? null,
      heightCm: input.heightCm ?? null,
      weightKg: input.weightKg ?? null,
      bloodType: input.bloodType ?? null,
      waistCircumferenceCm: input.waistCircumferenceCm ?? null,
      bodyFatPercentage: input.bodyFatPercentage ?? null,
      headCircumferenceCm: input.headCircumferenceCm ?? null,
      rhBloodType: input.rhBloodType ?? null,
      caregivers: Array.isArray(input.caregivers) ? input.caregivers : [],
      primaryRecorderRelationship: input.primaryRecorderRelationship ?? null,
      otherRelative: input.otherRelative ?? null,
      otherCaregiver: input.otherCaregiver ?? null,
      isSelf: Boolean(input.isSelf),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }
    await this.#store.update((data) => ({ ...data, members: [...data.members, member] }))
    return member
  }

  async ensureSelf(accountId, now = new Date()) {
    let selfMember
    await this.#store.update((data) => {
      selfMember = data.members.find((member) => member.accountId === accountId && member.isSelf)
      if (selfMember) return data
      selfMember = {
        id: randomUUID(),
        accountId,
        name: '我',
        relationship: 'self',
        gender: null,
        birthday: null,
        avatar: null,
        heightCm: null,
        weightKg: null,
        bloodType: null,
        waistCircumferenceCm: null,
        bodyFatPercentage: null,
        headCircumferenceCm: null,
        rhBloodType: null,
        isSelf: true,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      }
      return { ...data, members: [...data.members, selfMember] }
    })
    return selfMember
  }

  async findById(id) {
    const data = await this.#store.read()
    return data.members.find((member) => member.id === id) ?? null
  }

  async findByAccountId(accountId) {
    const data = await this.#store.read()
    return data.members
      .filter((member) => member.accountId === accountId)
      .sort((left, right) => Number(right.isSelf) - Number(left.isSelf) || left.createdAt.localeCompare(right.createdAt))
  }

  async update(id, changes, now = new Date()) {
    let updated = null
    await this.#store.update((data) => ({
      ...data,
      members: data.members.map((member) => {
        if (member.id !== id) return member
        updated = { ...member, ...changes, id: member.id, accountId: member.accountId, isSelf: member.isSelf, updatedAt: now.toISOString() }
        return updated
      })
    }))
    return updated
  }

  async delete(id) {
    let deleted = null
    await this.#store.update((data) => ({
      ...data,
      members: data.members.filter((member) => {
        if (member.id !== id) return true
        deleted = member
        return false
      })
    }))
    return deleted
  }
}
