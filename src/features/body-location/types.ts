import type { Member } from '../../types'

export type BodyLocationType = 'surface' | 'organ'
export type BodyLocationLaterality = 'left' | 'right' | 'bilateral' | 'center' | 'none'
export type BodyLocationView = 'front' | 'back' | 'internal'

export interface BodyLocationSelection {
  id: string
  label: string
  parentId?: string
  locationType: BodyLocationType
  laterality?: BodyLocationLaterality
  view?: BodyLocationView
}

export interface BodyLocationOption extends BodyLocationSelection {
  searchTerms?: readonly string[]
  applicableGender?: Exclude<Member['gender'], 'undisclosed' | ''>
}

export interface BodyLocationRegion {
  id: string
  label: string
  shortLabel?: string
  description: string
  view: BodyLocationView
  locationType: BodyLocationType
  diagram: 'head' | 'neck' | 'torso' | 'abdomen' | 'back' | 'pelvis' | 'upper-limb' | 'hand' | 'lower-limb' | 'foot' | 'organ'
  options: readonly BodyLocationOption[]
  searchTerms?: readonly string[]
}

export type BodyLocationMember = Pick<Member, 'age' | 'gender'>
