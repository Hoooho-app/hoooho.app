import { differenceInMonths, differenceInYears, isValid, parseISO } from 'date-fns'
import type { ProfileGender } from '../types'

export type ClayAvatarRole =
  | 'baby-boy'
  | 'baby-girl'
  | 'toddler-boy'
  | 'toddler-girl'
  | 'boy'
  | 'girl'
  | 'adult-male'
  | 'adult-female'
  | 'elder-male'
  | 'elder-female'

export type AppearancePreset =
  | 'east-asian'
  | 'south-asian'
  | 'african'
  | 'european'
  | 'middle-eastern-north-african'
  | 'latin-mixed'

export interface ClayAvatarConfig {
  version: 1
  role: ClayAvatarRole
  appearance: AppearancePreset
}

export const clayAvatarRoles = [
  'baby-boy', 'baby-girl', 'toddler-boy', 'toddler-girl',
  'boy', 'girl', 'adult-male', 'adult-female', 'elder-male', 'elder-female'
] as const satisfies readonly ClayAvatarRole[]

export const appearancePresets = [
  'east-asian',
  'south-asian',
  'african',
  'european',
  'middle-eastern-north-african',
  'latin-mixed'
] as const satisfies readonly AppearancePreset[]

export const clayAvatarAssetManifest = {
  version: 1,
  basePath: '/avatars/clay/v1',
  roles: clayAvatarRoles,
  appearances: appearancePresets
} as const

// The approved sprite sheets place each portrait circle at a slightly different
// point inside its 512px cell. These focal points keep the complete, pre-rendered
// artwork centred in a single circular viewport without modifying the assets.
const clayAvatarFocalPoints = {
  'east-asian': [57.3, 50.4],
  'south-asian': [53.5, 50.5],
  african: [40.2, 50.7],
  european: [56.9, 44.5],
  'middle-eastern-north-african': [53.4, 44.7],
  'latin-mixed': [40.1, 44.7]
} as const satisfies Record<AppearancePreset, readonly [number, number]>

export function getClayAvatarViewport(config: ClayAvatarConfig) {
  const [focusX, focusY] = clayAvatarFocalPoints[config.appearance]
  const scale = 1.2
  return {
    height: `${scale * 100}%`,
    left: `${50 - scale * focusX}%`,
    top: `${50 - scale * focusY}%`,
    width: `${scale * 100}%`
  }
}

export function getClayAvatarAssetPath(config: ClayAvatarConfig) {
  return `${clayAvatarAssetManifest.basePath}/${config.role}-${config.appearance}.png`
}

export function resolveClayAvatarRole(birthday: string, gender: ProfileGender, today = new Date()): ClayAvatarRole {
  const birthDate = parseISO(birthday)
  const female = gender === 'female'
  if (!isValid(birthDate)) return female ? 'adult-female' : 'adult-male'

  const months = Math.max(differenceInMonths(today, birthDate), 0)
  if (months < 12) return female ? 'baby-girl' : 'baby-boy'
  if (months < 36) return female ? 'toddler-girl' : 'toddler-boy'

  const age = Math.max(differenceInYears(today, birthDate), 0)
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

export function createClayAvatarConfig(
  name: string,
  birthday: string,
  gender: Extract<ProfileGender, 'male' | 'female'>,
  stableId = '',
  today = new Date()
): ClayAvatarConfig {
  const seedSource = [stableId.trim(), name.normalize('NFKC').trim(), birthday, gender].join('|')
  return {
    version: 1,
    role: resolveClayAvatarRole(birthday, gender, today),
    appearance: appearancePresets[stableHash(seedSource) % appearancePresets.length]
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

export function cycleClayAvatar(config: ClayAvatarConfig): ClayAvatarConfig {
  const current = appearancePresets.indexOf(config.appearance)
  const next = (current + 1) % appearancePresets.length
  return { ...config, appearance: appearancePresets[next] }
}

const prefix = 'clay:v1:'

export function serializeClayAvatar(config: ClayAvatarConfig) {
  return `${prefix}${config.role}:${config.appearance}`
}

export function parseClayAvatar(value?: string | null): ClayAvatarConfig | null {
  if (!value?.startsWith(prefix)) return null
  const parts = value.slice(prefix.length).split(':')
  const [role, appearance] = parts
  if (!clayAvatarRoles.includes(role as ClayAvatarRole)) return null

  if (parts.length === 2 && appearancePresets.includes(appearance as AppearancePreset)) {
    return { version: 1, role: role as ClayAvatarRole, appearance: appearance as AppearancePreset }
  }

  // Compatibility with the previously released layered format:
  // clay:v1:<role>:<face>:<hair>:<outfit>. The whole legacy value is used as a
  // stable seed so every saved avatar maps to one complete preset without gaps.
  if (parts.length === 4) {
    return {
      version: 1,
      role: role as ClayAvatarRole,
      appearance: appearancePresets[stableHash(value) % appearancePresets.length]
    }
  }

  return null
}
