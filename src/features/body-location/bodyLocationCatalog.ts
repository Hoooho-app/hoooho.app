import type { BodyLocationMember, BodyLocationOption, BodyLocationRegion, BodyLocationSelection, BodyLocationView } from './types'

const option = (
  id: string,
  label: string,
  parentId: string,
  view: BodyLocationView,
  laterality: BodyLocationOption['laterality'] = 'none',
  extra: Partial<BodyLocationOption> = {}
): BodyLocationOption => ({ id, label, parentId, view, laterality, locationType: view === 'internal' ? 'organ' : 'surface', ...extra })

export const BODY_LOCATION_REGIONS: readonly BodyLocationRegion[] = [
  { id: 'head', label: '头部', description: '头面部与后脑区域', view: 'front', locationType: 'surface', diagram: 'head', searchTerms: ['头疼', '头痛'], options: [
    option('head_forehead', '前额', 'head', 'front', 'center'), option('head_temple_left', '左太阳穴', 'head', 'front', 'left'), option('head_temple_right', '右太阳穴', 'head', 'front', 'right'), option('head_face_left', '左侧头面', 'head', 'front', 'left'), option('head_face_right', '右侧头面', 'head', 'front', 'right'), option('head_whole', '整个头部', 'head', 'front', 'bilateral'), option('head_occipital', '后脑', 'head', 'back', 'center'), option('head_crown', '头顶', 'head', 'front', 'center')
  ] },
  { id: 'neck', label: '颈部', description: '颈前、颈后与两侧', view: 'front', locationType: 'surface', diagram: 'neck', options: [
    option('neck_front', '颈前', 'neck', 'front', 'center'), option('neck_back', '颈后', 'neck', 'back', 'center'), option('neck_left', '左侧颈部', 'neck', 'front', 'left'), option('neck_right', '右侧颈部', 'neck', 'front', 'right'), option('neck_whole', '整个颈部', 'neck', 'front', 'bilateral')
  ] },
  { id: 'chest', label: '胸部', description: '胸前与胸廓两侧', view: 'front', locationType: 'surface', diagram: 'torso', options: [
    option('chest_left', '左胸', 'chest', 'front', 'left'), option('chest_center', '胸口正中', 'chest', 'front', 'center'), option('chest_right', '右胸', 'chest', 'front', 'right'), option('chest_left_rib', '左侧肋部', 'chest', 'front', 'left'), option('chest_right_rib', '右侧肋部', 'chest', 'front', 'right'), option('chest_whole', '整个胸部', 'chest', 'front', 'bilateral')
  ] },
  { id: 'abdomen', label: '腹部', description: '按腹部位置区域定位', view: 'front', locationType: 'surface', diagram: 'abdomen', searchTerms: ['肚子', '肚'], options: [
    option('abdomen_left_upper', '左上腹', 'abdomen', 'front', 'left'), option('abdomen_upper', '上腹', 'abdomen', 'front', 'center'), option('abdomen_right_upper', '右上腹', 'abdomen', 'front', 'right'), option('abdomen_left_side', '左侧腹', 'abdomen', 'front', 'left'), option('abdomen_navel', '脐周', 'abdomen', 'front', 'center'), option('abdomen_right_side', '右侧腹', 'abdomen', 'front', 'right'), option('abdomen_left_lower', '左下腹', 'abdomen', 'front', 'left'), option('abdomen_lower', '下腹', 'abdomen', 'front', 'center'), option('abdomen_right_lower', '右下腹', 'abdomen', 'front', 'right')
  ] },
  { id: 'back', label: '背部', description: '肩胛、上背与下背', view: 'back', locationType: 'surface', diagram: 'back', options: [
    option('back_scapular_left', '左肩胛区', 'back', 'back', 'left'), option('back_scapular_right', '右肩胛区', 'back', 'back', 'right'), option('back_upper', '上背部', 'back', 'back', 'center'), option('back_middle', '中背部', 'back', 'back', 'center'), option('back_lower_left', '左侧下背', 'back', 'back', 'left'), option('back_lower_right', '右侧下背', 'back', 'back', 'right'), option('back_lower', '下背部', 'back', 'back', 'center')
  ] },
  { id: 'waist_pelvis', label: '腰部 / 臀部', shortLabel: '腰臀', description: '腰侧、腰骶与臀部', view: 'back', locationType: 'surface', diagram: 'pelvis', searchTerms: ['腰', '屁股'], options: [
    option('waist_left', '左腰', 'waist_pelvis', 'back', 'left'), option('waist_right', '右腰', 'waist_pelvis', 'back', 'right'), option('waist_center', '腰骶部', 'waist_pelvis', 'back', 'center'), option('hip_left', '左臀', 'waist_pelvis', 'back', 'left'), option('hip_right', '右臀', 'waist_pelvis', 'back', 'right'), option('hip_bilateral', '双侧臀部', 'waist_pelvis', 'back', 'bilateral')
  ] },
  { id: 'upper_limb', label: '上肢', description: '肩、上臂、肘与前臂', view: 'front', locationType: 'surface', diagram: 'upper-limb', searchTerms: ['胳膊', '手臂'], options: [
    option('upper_limb_shoulder_left', '左肩', 'upper_limb', 'front', 'left'), option('upper_limb_shoulder_right', '右肩', 'upper_limb', 'front', 'right'), option('upper_limb_upper_arm_left', '左上臂', 'upper_limb', 'front', 'left'), option('upper_limb_upper_arm_right', '右上臂', 'upper_limb', 'front', 'right'), option('upper_limb_elbow_left', '左肘', 'upper_limb', 'front', 'left'), option('upper_limb_elbow_right', '右肘', 'upper_limb', 'front', 'right'), option('upper_limb_forearm_left', '左前臂', 'upper_limb', 'front', 'left'), option('upper_limb_forearm_right', '右前臂', 'upper_limb', 'front', 'right')
  ] },
  { id: 'hand', label: '手', description: '手腕、手掌、手背与手指', view: 'front', locationType: 'surface', diagram: 'hand', options: [
    option('hand_wrist_left', '左手腕', 'hand', 'front', 'left'), option('hand_wrist_right', '右手腕', 'hand', 'front', 'right'), option('hand_palm_left', '左手掌', 'hand', 'front', 'left'), option('hand_palm_right', '右手掌', 'hand', 'front', 'right'), option('hand_back_left', '左手背', 'hand', 'back', 'left'), option('hand_back_right', '右手背', 'hand', 'back', 'right'), option('hand_fingers_left', '左手指', 'hand', 'front', 'left'), option('hand_fingers_right', '右手指', 'hand', 'front', 'right')
  ] },
  { id: 'lower_limb', label: '下肢', description: '髋、大腿、膝与小腿', view: 'front', locationType: 'surface', diagram: 'lower-limb', searchTerms: ['腿'], options: [
    option('lower_limb_hip_left', '左髋', 'lower_limb', 'front', 'left'), option('lower_limb_hip_right', '右髋', 'lower_limb', 'front', 'right'), option('lower_limb_thigh_left', '左大腿', 'lower_limb', 'front', 'left'), option('lower_limb_thigh_right', '右大腿', 'lower_limb', 'front', 'right'), option('lower_limb_knee_left', '左膝', 'lower_limb', 'front', 'left'), option('lower_limb_knee_right', '右膝', 'lower_limb', 'front', 'right'), option('lower_limb_calf_left', '左小腿', 'lower_limb', 'front', 'left'), option('lower_limb_calf_right', '右小腿', 'lower_limb', 'front', 'right')
  ] },
  { id: 'foot', label: '足', description: '脚踝、脚背、足底与脚趾', view: 'front', locationType: 'surface', diagram: 'foot', searchTerms: ['脚'], options: [
    option('foot_ankle_left', '左脚踝', 'foot', 'front', 'left'), option('foot_ankle_right', '右脚踝', 'foot', 'front', 'right'), option('foot_dorsum_left', '左脚背', 'foot', 'front', 'left'), option('foot_dorsum_right', '右脚背', 'foot', 'front', 'right'), option('foot_sole_left', '左足底', 'foot', 'back', 'left'), option('foot_sole_right', '右足底', 'foot', 'back', 'right'), option('foot_toes_left', '左脚趾', 'foot', 'front', 'left'), option('foot_toes_right', '右脚趾', 'foot', 'front', 'right')
  ] },
  { id: 'pelvis_perineum', label: '骨盆 / 会阴', shortLabel: '骨盆', description: '骨盆与会阴区域', view: 'front', locationType: 'surface', diagram: 'pelvis', options: [
    option('pelvis_left', '左侧骨盆', 'pelvis_perineum', 'front', 'left'), option('pelvis_right', '右侧骨盆', 'pelvis_perineum', 'front', 'right'), option('pelvis_center', '骨盆中央', 'pelvis_perineum', 'front', 'center'), option('groin_left', '左腹股沟', 'pelvis_perineum', 'front', 'left'), option('groin_right', '右腹股沟', 'pelvis_perineum', 'front', 'right'), option('perineum', '会阴部', 'pelvis_perineum', 'front', 'center')
  ] },
  { id: 'internal_organs', label: '内部器官', shortLabel: '器官', description: '常见胸腹与盆腔器官', view: 'internal', locationType: 'organ', diagram: 'organ', searchTerms: ['内脏', '器官'], options: [
    option('organ_heart', '心脏', 'internal_organs', 'internal'), option('organ_lung_left', '左肺', 'internal_organs', 'internal', 'left'), option('organ_lung_right', '右肺', 'internal_organs', 'internal', 'right'), option('organ_stomach', '胃', 'internal_organs', 'internal'), option('organ_liver', '肝脏', 'internal_organs', 'internal'), option('organ_gallbladder', '胆囊', 'internal_organs', 'internal'), option('organ_pancreas', '胰腺', 'internal_organs', 'internal'), option('organ_spleen', '脾', 'internal_organs', 'internal'), option('organ_kidney_left', '左肾', 'internal_organs', 'internal', 'left'), option('organ_kidney_right', '右肾', 'internal_organs', 'internal', 'right'), option('organ_small_intestine', '小肠', 'internal_organs', 'internal'), option('organ_large_intestine', '大肠', 'internal_organs', 'internal'), option('organ_bladder', '膀胱', 'internal_organs', 'internal'), option('organ_uterus', '子宫', 'internal_organs', 'internal', 'none', { applicableGender: 'female' }), option('organ_prostate', '前列腺', 'internal_organs', 'internal', 'none', { applicableGender: 'male' })
  ] }
]

const appliesToMember = (item: BodyLocationOption, member?: BodyLocationMember) => !item.applicableGender || !member?.gender || member.gender === 'undisclosed' || item.applicableGender === member.gender

export function getBodyLocationRegions(member?: BodyLocationMember): BodyLocationRegion[] {
  return BODY_LOCATION_REGIONS.map((region) => ({ ...region, options: region.options.filter((item) => appliesToMember(item, member)) }))
}

export function searchBodyLocations(query: string, member?: BodyLocationMember): BodyLocationOption[] {
  const keyword = query.trim().toLocaleLowerCase('zh-CN')
  if (!keyword) return []
  return getBodyLocationRegions(member).flatMap((region) => region.options.filter((item) => [item.label, ...(item.searchTerms ?? []), region.label, ...(region.searchTerms ?? [])].some((value) => value.toLocaleLowerCase('zh-CN').includes(keyword))))
}

export function findBodyLocation(value: string): BodyLocationSelection | undefined {
  const normalized = value.trim()
  for (const region of BODY_LOCATION_REGIONS) {
    const match = region.options.find((item) => item.id === normalized || item.label === normalized)
    if (match) return toBodyLocationSelection(match)
  }
  return undefined
}

export function toBodyLocationSelection(item: BodyLocationOption): BodyLocationSelection {
  return { id: item.id, label: item.label, parentId: item.parentId, locationType: item.locationType, laterality: item.laterality, view: item.view }
}

export function normalizeBodyLocationSelection(value: unknown, fallbackIndex = 0): BodyLocationSelection | undefined {
  if (typeof value === 'string') return findBodyLocation(value) ?? { id: `legacy_location_${fallbackIndex}`, label: value, locationType: 'surface', laterality: 'none' }
  if (!value || typeof value !== 'object') return undefined
  const item = value as Partial<BodyLocationSelection>
  if (!item.id || !item.label || (item.locationType !== 'surface' && item.locationType !== 'organ')) return undefined
  return { id: String(item.id), label: String(item.label), parentId: item.parentId ? String(item.parentId) : undefined, locationType: item.locationType, laterality: item.laterality, view: item.view }
}
