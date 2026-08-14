import type { Member } from '../../types'

export type BodyLocationType = 'surface' | 'organ'
export type BodyLocationLaterality = 'left' | 'right' | 'bilateral' | 'center' | 'none'
export type BodyLocationView = 'front' | 'back' | 'internal' | 'palm' | 'dorsum' | 'sole' | 'organ-reference'
export type BodyLocationAtlasKey = 'head' | 'chest' | 'abdomen' | 'back' | 'hand' | 'foot'

export interface BodyLocationAtlasView {
  id: BodyLocationView
  label: string
}

export interface BodyLocationSelection {
  id: string
  label: string
  parentId?: string
  locationType: BodyLocationType
  laterality?: BodyLocationLaterality
  view?: BodyLocationView
}

export interface BodyLocationOption extends BodyLocationSelection {
  clinicalLabel?: string
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
  atlas?: BodyLocationAtlasKey
  atlasViews?: readonly BodyLocationAtlasView[]
  options: readonly BodyLocationOption[]
  searchTerms?: readonly string[]
}

export type BodyLocationMember = Pick<Member, 'age' | 'gender'>
