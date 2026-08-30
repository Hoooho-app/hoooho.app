import { differenceInMonths, differenceInYears, isValid, parseISO } from 'date-fns'
import type { ProfileGender } from '../types'
import { clayAvatarAssetPaths } from '../generated/clayAvatarAssets'

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

// The approved sheets do not place the person at one shared horizontal point:
// the circle background and the subject also shift between role rows. Asset-level
// focal points keep the person centred without altering the pre-rendered artwork.
const clayAvatarHorizontalFocalPoints = {
  'baby-boy': {
    'east-asian': 55.6, 'south-asian': 51.1, african: 46.6, european: 58.4,
    'middle-eastern-north-african': 51.6, 'latin-mixed': 46.2
  },
  'baby-girl': {
    'east-asian': 58.5, 'south-asian': 50.6, african: 41, european: 60,
    'middle-eastern-north-african': 50.6, 'latin-mixed': 41.5
  },
  'toddler-boy': {
    'east-asian': 55.6, 'south-asian': 50.4, african: 44.8, european: 56.4,
    'middle-eastern-north-african': 50.1, 'latin-mixed': 44.3
  },
  'toddler-girl': {
    'east-asian': 60.9, 'south-asian': 49.6, african: 39.7, european: 62.7,
    'middle-eastern-north-african': 50.3, 'latin-mixed': 39.2
  },
  boy: {
    'east-asian': 59.1, 'south-asian': 49.5, african: 40.4, european: 60.6,
    'middle-eastern-north-african': 49.5, 'latin-mixed': 40
  },
  girl: {
    'east-asian': 59.6, 'south-asian': 50, african: 39, european: 59.9,
    'middle-eastern-north-african': 49.1, 'latin-mixed': 38.6
  },
  'adult-male': {
    'east-asian': 59, 'south-asian': 49.4, african: 41.1, european: 59.7,
    'middle-eastern-north-african': 49.9, 'latin-mixed': 40.5
  },
  'adult-female': {
    'east-asian': 59.4, 'south-asian': 50.2, african: 40.4, european: 59.6,
    'middle-eastern-north-african': 50.1, 'latin-mixed': 39.7
  },
  'elder-male': {
    'east-asian': 61.3, 'south-asian': 50.6, african: 41.2, european: 62.7,
    'middle-eastern-north-african': 51.4, 'latin-mixed': 42
  },
  'elder-female': {
    'east-asian': 61.4, 'south-asian': 52.3, african: 41.8, european: 61.6,
    'middle-eastern-north-african': 51.7, 'latin-mixed': 42.1
  }
} as const satisfies Record<ClayAvatarRole, Record<AppearancePreset, number>>

const clayAvatarVerticalFocalPoints = {
  'east-asian': 50.4,
  'south-asian': 50.5,
  african: 50.7,
  european: 44.5,
  'middle-eastern-north-african': 44.7,
  'latin-mixed': 44.7
} as const satisfies Record<AppearancePreset, number>

function viewportPercent(value: number) {
  return `${Math.round(value * 100) / 100}%`
}

export function getClayAvatarViewport(config: ClayAvatarConfig) {
  const focusX = clayAvatarHorizontalFocalPoints[config.role][config.appearance]
  const focusY = clayAvatarVerticalFocalPoints[config.appearance]
  const scale = 1.2
  return {
    height: viewportPercent(scale * 100),
    left: viewportPercent(50 - scale * focusX),
    top: viewportPercent(50 - scale * focusY),
    width: viewportPercent(scale * 100)
  }
}

export function getClayAvatarAssetPath(config: ClayAvatarConfig) {
  const id = `${config.role}-${config.appearance}` as keyof typeof clayAvatarAssetPaths
  return clayAvatarAssetPaths[id]
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
