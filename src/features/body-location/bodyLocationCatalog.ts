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
  { id: 'head', label: '头部', description: '直接在头面或后脑图上选择不适位置', view: 'front', locationType: 'surface', diagram: 'head', atlas: 'head', atlasViews: [{ id: 'front', label: '正面' }, { id: 'back', label: '后面' }], searchTerms: ['头疼', '头痛'], options: [
    option('head_forehead', '前额', 'head', 'front', 'center', { clinicalLabel: '额部' }), option('head_temple_left', '左太阳穴', 'head', 'front', 'left', { clinicalLabel: '左颞部' }), option('head_temple_right', '右太阳穴', 'head', 'front', 'right', { clinicalLabel: '右颞部' }), option('head_face_left', '左侧头面', 'head', 'front', 'left'), option('head_face_right', '右侧头面', 'head', 'front', 'right'), option('head_crown', '头顶', 'head', 'front', 'center', { clinicalLabel: '顶部' }), option('head_occipital', '后脑', 'head', 'back', 'center', { clinicalLabel: '枕部' }), option('head_back_left', '左后脑', 'head', 'back', 'left'), option('head_back_right', '右后脑', 'head', 'back', 'right')
  ] },
  { id: 'neck', label: '颈部', description: '颈前、颈后与两侧', view: 'front', locationType: 'surface', diagram: 'neck', options: [
    option('neck_front', '颈前', 'neck', 'front', 'center'), option('neck_back', '颈后', 'neck', 'back', 'center'), option('neck_left', '左侧颈部', 'neck', 'front', 'left'), option('neck_right', '右侧颈部', 'neck', 'front', 'right'), option('neck_whole', '整个颈部', 'neck', 'front', 'bilateral')
  ] },
  { id: 'chest', label: '胸部', description: '顺着胸廓自然区域选择胸前或后胸位置', view: 'front', locationType: 'surface', diagram: 'torso', atlas: 'chest', atlasViews: [{ id: 'front', label: '正面' }, { id: 'back', label: '背面' }], options: [
    option('chest_upper_left', '左上胸', 'chest', 'front', 'left'), option('chest_upper_right', '右上胸', 'chest', 'front', 'right'), option('chest_left', '左前胸', 'chest', 'front', 'left'), option('chest_center', '胸骨区', 'chest', 'front', 'center'), option('chest_right', '右前胸', 'chest', 'front', 'right'), option('chest_left_rib', '左肋缘', 'chest', 'front', 'left'), option('chest_right_rib', '右肋缘', 'chest', 'front', 'right'), option('chest_wall_left', '左侧胸壁', 'chest', 'front', 'left'), option('chest_wall_right', '右侧胸壁', 'chest', 'front', 'right'), option('chest_scapular_left', '左肩胛区', 'chest', 'back', 'left'), option('chest_scapular_right', '右肩胛区', 'chest', 'back', 'right'), option('chest_spine', '胸椎中央', 'chest', 'back', 'center'), option('chest_back_left', '左后胸', 'chest', 'back', 'left'), option('chest_back_right', '右后胸', 'chest', 'back', 'right')
  ] },
  { id: 'abdomen', label: '腹部', description: '在真实躯干轮廓上选择感觉位置；器官图仅供理解', view: 'front', locationType: 'surface', diagram: 'abdomen', atlas: 'abdomen', atlasViews: [{ id: 'front', label: '位置区域' }, { id: 'organ-reference', label: '器官参照' }], searchTerms: ['肚子', '肚'], options: [
    option('abdomen_left_upper', '左上腹', 'abdomen', 'front', 'left', { clinicalLabel: '左季肋区' }), option('abdomen_upper', '上腹', 'abdomen', 'front', 'center', { clinicalLabel: '腹上区' }), option('abdomen_right_upper', '右上腹', 'abdomen', 'front', 'right', { clinicalLabel: '右季肋区' }), option('abdomen_left_side', '左侧腹', 'abdomen', 'front', 'left', { clinicalLabel: '左腰区' }), option('abdomen_navel', '脐周', 'abdomen', 'front', 'center', { clinicalLabel: '脐区' }), option('abdomen_right_side', '右侧腹', 'abdomen', 'front', 'right', { clinicalLabel: '右腰区' }), option('abdomen_left_lower', '左下腹', 'abdomen', 'front', 'left', { clinicalLabel: '左髂区' }), option('abdomen_lower', '下腹', 'abdomen', 'front', 'center', { clinicalLabel: '腹下区' }), option('abdomen_right_lower', '右下腹', 'abdomen', 'front', 'right', { clinicalLabel: '右髂区' })
  ] },
  { id: 'back', label: '腰背', description: '在背面轮廓上选择肩胛、脊柱或下背位置', view: 'back', locationType: 'surface', diagram: 'back', atlas: 'back', atlasViews: [{ id: 'back', label: '背面' }], searchTerms: ['背部', '后背', '腰背'], options: [
    option('back_scapular_left', '左肩胛区', 'back', 'back', 'left'), option('back_scapular_right', '右肩胛区', 'back', 'back', 'right'), option('back_upper', '上背部', 'back', 'back', 'center'), option('back_middle', '中背部', 'back', 'back', 'center'), option('back_lower_left', '左侧下背', 'back', 'back', 'left'), option('back_lower_right', '右侧下背', 'back', 'back', 'right'), option('back_lower', '下背部', 'back', 'back', 'center')
  ] },
  { id: 'waist_pelvis', label: '腰部 / 臀部', shortLabel: '腰臀', description: '腰侧、腰骶与臀部', view: 'back', locationType: 'surface', diagram: 'pelvis', searchTerms: ['腰', '屁股'], options: [
    option('waist_left', '左腰', 'waist_pelvis', 'back', 'left'), option('waist_right', '右腰', 'waist_pelvis', 'back', 'right'), option('waist_center', '腰骶部', 'waist_pelvis', 'back', 'center'), option('hip_left', '左臀', 'waist_pelvis', 'back', 'left'), option('hip_right', '右臀', 'waist_pelvis', 'back', 'right'), option('hip_bilateral', '双侧臀部', 'waist_pelvis', 'back', 'bilateral')
  ] },
  { id: 'upper_limb', label: '上肢', description: '肩、上臂、肘与前臂', view: 'front', locationType: 'surface', diagram: 'upper-limb', searchTerms: ['胳膊', '手臂'], options: [
    option('upper_limb_shoulder_left', '左肩', 'upper_limb', 'front', 'left'), option('upper_limb_shoulder_right', '右肩', 'upper_limb', 'front', 'right'), option('upper_limb_upper_arm_left', '左上臂', 'upper_limb', 'front', 'left'), option('upper_limb_upper_arm_right', '右上臂', 'upper_limb', 'front', 'right'), option('upper_limb_elbow_left', '左肘', 'upper_limb', 'front', 'left'), option('upper_limb_elbow_right', '右肘', 'upper_limb', 'front', 'right'), option('upper_limb_forearm_left', '左前臂', 'upper_limb', 'front', 'left'), option('upper_limb_forearm_right', '右前臂', 'upper_limb', 'front', 'right')
  ] },
  { id: 'hand', label: '手', description: '选择左手或右手，再在手掌或手背图上定位', view: 'palm', locationType: 'surface', diagram: 'hand', atlas: 'hand', atlasViews: [{ id: 'palm', label: '手掌' }, { id: 'dorsum', label: '手背' }], options: [
    ...(['left', 'right'] as const).flatMap((side) => { const sideLabel = side === 'left' ? '左' : '右'; return [
      option(`hand_wrist_${side}`, `${sideLabel}手腕`, 'hand', 'palm', side), option(`hand_thumb_${side}`, `${sideLabel}拇指`, 'hand', 'palm', side), option(`hand_index_${side}`, `${sideLabel}食指`, 'hand', 'palm', side), option(`hand_middle_${side}`, `${sideLabel}中指`, 'hand', 'palm', side), option(`hand_ring_${side}`, `${sideLabel}无名指`, 'hand', 'palm', side), option(`hand_little_${side}`, `${sideLabel}小指`, 'hand', 'palm', side), option(`hand_thenar_${side}`, `${sideLabel}大鱼际`, 'hand', 'palm', side), option(`hand_palm_${side}`, `${sideLabel}手掌中央`, 'hand', 'palm', side), option(`hand_hypothenar_${side}`, `${sideLabel}小鱼际`, 'hand', 'palm', side), option(`hand_knuckle_${side}`, `${sideLabel}指根关节`, 'hand', 'dorsum', side), option(`hand_back_${side}`, `${sideLabel}手背中央`, 'hand', 'dorsum', side)
    ] })
  ] },
  { id: 'lower_limb', label: '下肢', description: '髋、大腿、膝与小腿', view: 'front', locationType: 'surface', diagram: 'lower-limb', searchTerms: ['腿'], options: [
    option('lower_limb_hip_left', '左髋', 'lower_limb', 'front', 'left'), option('lower_limb_hip_right', '右髋', 'lower_limb', 'front', 'right'), option('lower_limb_thigh_left', '左大腿', 'lower_limb', 'front', 'left'), option('lower_limb_thigh_right', '右大腿', 'lower_limb', 'front', 'right'), option('lower_limb_knee_left', '左膝', 'lower_limb', 'front', 'left'), option('lower_limb_knee_right', '右膝', 'lower_limb', 'front', 'right'), option('lower_limb_calf_left', '左小腿', 'lower_limb', 'front', 'left'), option('lower_limb_calf_right', '右小腿', 'lower_limb', 'front', 'right')
  ] },
  { id: 'foot', label: '足', description: '选择左足或右足，再在足背或足底图上定位', view: 'dorsum', locationType: 'surface', diagram: 'foot', atlas: 'foot', atlasViews: [{ id: 'dorsum', label: '足背' }, { id: 'sole', label: '足底' }], searchTerms: ['脚'], options: [
    ...(['left', 'right'] as const).flatMap((side) => { const sideLabel = side === 'left' ? '左' : '右'; return [
      option(`foot_ankle_${side}`, `${sideLabel}踝前区`, 'foot', 'dorsum', side), option(`foot_dorsum_medial_${side}`, `${sideLabel}足背内侧`, 'foot', 'dorsum', side), option(`foot_dorsum_${side}`, `${sideLabel}足背中央`, 'foot', 'dorsum', side), option(`foot_dorsum_lateral_${side}`, `${sideLabel}足背外侧`, 'foot', 'dorsum', side), option(`foot_medial_edge_${side}`, `${sideLabel}足内侧缘`, 'foot', 'dorsum', side), option(`foot_lateral_edge_${side}`, `${sideLabel}足外侧缘`, 'foot', 'dorsum', side), option(`foot_forefoot_${side}`, `${sideLabel}前足`, 'foot', 'dorsum', side), option(`foot_big_toe_${side}`, `${sideLabel}大拇趾`, 'foot', 'dorsum', side), option(`foot_other_toes_${side}`, `${sideLabel}其他脚趾`, 'foot', 'dorsum', side), option(`foot_heel_${side}`, `${sideLabel}足跟`, 'foot', 'sole', side), option(`foot_arch_medial_${side}`, `${sideLabel}内侧足弓`, 'foot', 'sole', side), option(`foot_arch_lateral_${side}`, `${sideLabel}外侧足弓`, 'foot', 'sole', side), option(`foot_ball_medial_${side}`, `${sideLabel}前脚掌内侧`, 'foot', 'sole', side), option(`foot_sole_${side}`, `${sideLabel}前脚掌中央`, 'foot', 'sole', side), option(`foot_ball_lateral_${side}`, `${sideLabel}前脚掌外侧`, 'foot', 'sole', side), option(`foot_sole_big_toe_${side}`, `${sideLabel}足底大拇趾`, 'foot', 'sole', side), option(`foot_sole_other_toes_${side}`, `${sideLabel}足底其他脚趾`, 'foot', 'sole', side)
    ] })
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
  return getBodyLocationRegions(member).flatMap((region) => region.options.filter((item) => [item.label, item.clinicalLabel, ...(item.searchTerms ?? []), region.label, ...(region.searchTerms ?? [])].filter(Boolean).some((value) => value!.toLocaleLowerCase('zh-CN').includes(keyword))))
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

export function bodyLocationSelectionLabels(values: readonly BodyLocationSelection[]): string[] {
  return values.map((item) => item.label)
}

export function normalizeBodyLocationSelection(value: unknown, fallbackIndex = 0): BodyLocationSelection | undefined {
  if (typeof value === 'string') return findBodyLocation(value) ?? { id: `legacy_location_${fallbackIndex}`, label: value, locationType: 'surface', laterality: 'none' }
  if (!value || typeof value !== 'object') return undefined
  const item = value as Partial<BodyLocationSelection>
  if (!item.id || !item.label || (item.locationType !== 'surface' && item.locationType !== 'organ')) return undefined
  return { id: String(item.id), label: String(item.label), parentId: item.parentId ? String(item.parentId) : undefined, locationType: item.locationType, laterality: item.laterality, view: item.view }
}
