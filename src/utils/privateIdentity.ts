import type { Member } from '../types'

/** Display-only masking. Never use this value when saving or exporting an identity. */
export function maskIdentityName(name: string | null | undefined): string {
  const characters = Array.from(name?.trim() ?? '')
  if (!characters.length) return ''
  if (characters.length === 1) return '*'
  if (characters.length === 2) return `*${characters[1]}`
  return `${characters[0]}${'*'.repeat(characters.length - 2)}${characters.at(-1)}`
}

export function recordSubjectRelationship(member: Pick<Member, 'relation' | 'gender'>): string {
  if (member.relation !== '子女') return member.relation
  return member.gender === 'female' ? '女儿' : member.gender === 'male' ? '儿子' : '子女'
}

/** Compact identity chrome; the precise birthday/age stays in the actual profile. */
export function compactIdentityAge(age: string): string {
  const years = age.match(/(\d+)岁/), months = age.match(/(\d+)个月/), days = age.match(/(\d+)天/)
  if (years && Number(years[1]) > 0) return `${years[1]}岁`
  if (months && Number(months[1]) > 0) return `${months[1]}个月`
  if (days) return `${days[1]}天`
  return age
}
