import { differenceInYears, isValid, parseISO } from 'date-fns'
import type { ProfileGender } from '../types'

export type ClayAvatarRole = 'adult-male' | 'adult-female' | 'boy' | 'girl' | 'elder-male' | 'elder-female'
export type ClayFaceVariant = 'deep' | 'warm' | 'light'
export type ClayHairVariant =
  | 'black-tight-curls' | 'brown-side-part' | 'golden-short' | 'silver-short'
  | 'brown-shoulder' | 'brown-soft-long' | 'brown-ponytail' | 'brown-bun'
  | 'black-braids' | 'black-afro' | 'silver-medium' | 'silver-waves'
export type ClayOutfitVariant = 'teal' | 'coral' | 'sage'
export type ClayAvatarPart = 'hairVariant' | 'faceVariant' | 'outfitVariant'

export interface ClayAvatarConfig {
  version: 1
  role: ClayAvatarRole
  faceVariant: ClayFaceVariant
  hairVariant: ClayHairVariant
  outfitVariant: ClayOutfitVariant
}

export const clayFaceVariants = ['deep', 'warm', 'light'] as const satisfies readonly ClayFaceVariant[]
export const clayHairVariants = [
  'black-tight-curls', 'brown-side-part', 'golden-short', 'silver-short',
  'brown-shoulder', 'brown-soft-long', 'brown-ponytail', 'brown-bun',
  'black-braids', 'black-afro', 'silver-medium', 'silver-waves'
] as const satisfies readonly ClayHairVariant[]
export const clayOutfitVariants = ['teal', 'coral', 'sage'] as const satisfies readonly ClayOutfitVariant[]

const roleRows: Record<ClayAvatarRole, number> = {
  'adult-male': 0,
  'adult-female': 1,
  boy: 2,
  girl: 3,
  'elder-male': 4,
  'elder-female': 5
}

export const clayAvatarAssetManifest = {
  version: 1,
  sources: {
    faces: '/avatars/clay/v1/source/faces-v1.png',
    hair: '/avatars/clay/v1/source/hair-v1.png',
    outfits: '/avatars/clay/v1/source/outfits-v1.png'
  },
  grids: {
    faces: { columns: 3, rows: 6 },
    hair: { columns: 4, rows: 3 },
    outfits: { columns: 3, rows: 6 }
  }
} as const

export function getClayAvatarCells(config: ClayAvatarConfig) {
  const hairIndex = clayHairVariants.indexOf(config.hairVariant)
  return {
    face: { column: clayFaceVariants.indexOf(config.faceVariant), row: roleRows[config.role] },
    hair: { column: hairIndex % 4, row: Math.floor(hairIndex / 4) },
    outfit: { column: clayOutfitVariants.indexOf(config.outfitVariant), row: roleRows[config.role] }
  }
}

export function resolveClayAvatarRole(birthday: string, gender: ProfileGender, today = new Date()): ClayAvatarRole {
  const birthDate = parseISO(birthday)
  const age = isValid(birthDate) ? Math.max(differenceInYears(today, birthDate), 0) : 18
  const female = gender === 'female'
  if (age < 18) return female ? 'girl' : 'boy'
  if (age < 60) return female ? 'adult-female' : 'adult-male'
  return female ? 'elder-female' : 'elder-male'
}

function stableHash(value: string) {
  let hash = 2166136261
  for (const character of value.normalize('NFKC').trim().toLocaleLowerCase()) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const roleHairOptions: Record<ClayAvatarRole, readonly ClayHairVariant[]> = {
  'adult-male': ['black-tight-curls', 'brown-side-part', 'golden-short', 'black-braids', 'black-afro'],
  'adult-female': ['brown-shoulder', 'brown-soft-long', 'brown-ponytail', 'brown-bun', 'black-braids', 'black-afro'],
  boy: ['black-tight-curls', 'brown-side-part', 'golden-short', 'black-braids', 'black-afro'],
  girl: ['brown-shoulder', 'brown-soft-long', 'brown-ponytail', 'brown-bun', 'black-braids', 'black-afro'],
  'elder-male': ['silver-short', 'silver-medium', 'silver-waves'],
  'elder-female': ['silver-medium', 'silver-waves', 'silver-short']
}

export function createClayAvatarConfig(
  name: string,
  birthday: string,
  gender: Extract<ProfileGender, 'male' | 'female'>,
  stableId = '',
  today = new Date()
): ClayAvatarConfig {
  const role = resolveClayAvatarRole(birthday, gender, today)
  const seed = stableHash([stableId.trim(), name.normalize('NFKC').trim(), birthday, gender].join('|'))
  const hairOptions = roleHairOptions[role]
  return {
    version: 1,
    role,
    faceVariant: clayFaceVariants[seed % clayFaceVariants.length],
    hairVariant: hairOptions[Math.floor(seed / 3) % hairOptions.length],
    outfitVariant: clayOutfitVariants[Math.floor(seed / 11) % clayOutfitVariants.length]
  }
}

export function remapClayAvatarRole(
  config: ClayAvatarConfig,
  birthday: string,
  gender: Extract<ProfileGender, 'male' | 'female'>,
  today = new Date()
): ClayAvatarConfig {
  return { ...config, role: resolveClayAvatarRole(birthday, gender, today) }
}

export function cycleClayAvatarPart(config: ClayAvatarConfig, part: ClayAvatarPart, direction: -1 | 1): ClayAvatarConfig {
  const options = part === 'hairVariant' ? clayHairVariants : part === 'faceVariant' ? clayFaceVariants : clayOutfitVariants
  const current = options.indexOf(config[part] as never)
  const next = (current + direction + options.length) % options.length
  return { ...config, [part]: options[next] }
}

const prefix = 'clay:v1:'

export function serializeClayAvatar(config: ClayAvatarConfig) {
  return `${prefix}${config.role}:${config.faceVariant}:${config.hairVariant}:${config.outfitVariant}`
}

export function parseClayAvatar(value?: string | null): ClayAvatarConfig | null {
  if (!value?.startsWith(prefix)) return null
  const [role, faceVariant, hairVariant, outfitVariant] = value.slice(prefix.length).split(':')
  if (!Object.hasOwn(roleRows, role)) return null
  if (!clayFaceVariants.includes(faceVariant as ClayFaceVariant)) return null
  if (!clayHairVariants.includes(hairVariant as ClayHairVariant)) return null
  if (!clayOutfitVariants.includes(outfitVariant as ClayOutfitVariant)) return null
  return { version: 1, role: role as ClayAvatarRole, faceVariant: faceVariant as ClayFaceVariant, hairVariant: hairVariant as ClayHairVariant, outfitVariant: outfitVariant as ClayOutfitVariant }
}
