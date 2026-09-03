import type { HealthProfileType } from './healthProfileTemplates'

export type HealthProfileSectionId =
  | 'basic' | 'allergy' | 'medication' | 'chronic' | 'surgery' | 'hospitalization'
  | 'transfusion' | 'examination' | 'vaccination' | 'family-history' | 'sleep'
  | 'diet' | 'exercise' | 'smoking' | 'alcohol' | 'exposure' | 'mental'
  | 'vision-hearing' | 'oral' | 'birth' | 'growth' | 'feeding' | 'menstrual'
  | 'pregnancy' | 'mobility' | 'fall'

export type HealthProfileFieldType = 'text' | 'number' | 'date' | 'time' | 'textarea' | 'select' | 'checkbox' | 'computed' | 'attachment'
export type HealthProfileSectionCategory = 'core' | 'long-term' | 'child'

export interface HealthProfileFieldOption { value: string; label: string }
export interface HealthProfileField {
  id: string
  label: string
  type: HealthProfileFieldType
  options?: Array<string | HealthProfileFieldOption>
  placeholder?: string
  unit?: string
}

export interface HealthProfileSectionConfig {
  id: HealthProfileSectionId
  title: string
  description: string
  guidance: string
  category: HealthProfileSectionCategory
  icon: 'activity' | 'allergy' | 'baby' | 'calendar' | 'care' | 'family' | 'file' | 'heart' | 'pill' | 'sleep' | 'stethoscope' | 'syringe' | 'utensils'
  activeFor: HealthProfileType[]
  repeatable?: boolean
  fields: HealthProfileField[]
}

const yn = ['是', '否']
const field = (id: string, label: string, type: HealthProfileFieldType = 'text', extra: Partial<HealthProfileField> = {}): HealthProfileField => ({ id, label, type, ...extra })
const note = field('note', '补充说明', 'textarea')
const attachment = field('attachment', '附件', 'attachment')

const childProfiles: HealthProfileType[] = ['infant', 'child', 'teen', 'adult-female', 'adult-male', 'elder-female', 'elder-male']
export const healthProfileSections: HealthProfileSectionConfig[] = [
  { id:'birth', title:'基础与出生信息', description:'出生阶段需要长期保留的重要背景', guidance:'姓名、出生日期和性别请在孩子资料中维护；这里只保留出生健康背景。', category:'child', icon:'baby', activeFor:childProfiles, fields:[field('gestationalWeeks','出生孕周','number',{unit:'周'}),field('birthWeight','出生体重','number',{unit:'kg'}),field('birthLength','出生身长','number',{unit:'cm'}),field('birthHeadCircumference','出生头围','number',{unit:'cm'}),field('premature','是否早产','select',{options:yn}),field('neonatal','新生儿阶段需要长期保留的重要情况','textarea'),attachment] },
  { id:'growth', title:'生长与营养背景', description:'长期喂养、进食要求和医生结论', guidance:'日常身高体重和每次进食变化请记入健康随记。', category:'child', icon:'activity', activeFor:childProfiles, repeatable:true, fields:[field('feedingMethod','主要喂养或饮食方式'),field('feedingDifficulty','长期进食困难','textarea'),field('confirmedNutrition','医生确认的营养问题','textarea'),field('dietRequirement','长期饮食要求','textarea'),field('doctorConclusion','生长相关医生结论','textarea'),note] },
  { id:'allergy', title:'过敏与不良反应', description:'明确或疑似过敏原及典型反应', guidance:'区分家长观察和医生确认，不自动判断因果关系。', category:'core', icon:'allergy', activeFor:childProfiles, repeatable:true, fields:[field('confirmedAllergen','已明确过敏原'),field('suspectedAllergen','疑似过敏原'),field('reaction','典型反应','textarea'),field('severity','严重程度'),field('firstFoundAt','首次发现时间','date'),field('doctorConfirmed','是否经过医生确认','select',{options:yn}),field('emergencyRequirement','紧急处理要求','textarea'),attachment] },
  { id:'medication', title:'长期用药', description:'长期使用药物的用户或医生原始信息', guidance:'系统只记录用户或医生提供的剂量，不推荐儿童用药剂量。', category:'core', icon:'pill', activeFor:childProfiles, repeatable:true, fields:[field('name','药品名'),field('image','药品照片','attachment'),field('form','剂型'),field('dose','每次用量'),field('frequency','使用频率'),field('reason','使用原因'),field('startedAt','开始日期','date'),field('endedAt','结束日期','date'),field('organization','开具机构'),note] },
  { id:'chronic', title:'长期健康问题', description:'已确诊或仍在长期观察的问题', guidance:'必须明确区分医生已经明确的诊断和仍待确认的问题。', category:'long-term', icon:'heart', activeFor:childProfiles, repeatable:true, fields:[field('confirmation','确认状态','select',{options:['医生已确诊','待确认']}),field('diagnosis','医生已经明确的诊断'),field('observation','尚未明确但长期观察的问题','textarea'),field('recurring','反复发生的身体情况','textarea'),field('prematureFollowup','早产相关随访问题','textarea'),note] },
  { id:'hospitalization', title:'住院与手术史', description:'住院、手术、麻醉和重要治疗经历', guidance:'记录已发生事实和报告，不自行补充医疗结论。', category:'long-term', icon:'stethoscope', activeFor:childProfiles, repeatable:true, fields:[field('hospitalization','住院经历','textarea'),field('surgery','手术'),field('anesthesia','麻醉'),field('treatment','重要治疗','textarea'),field('result','出院结论','textarea'),attachment,note] },
  { id:'family-history', title:'家族健康背景', description:'可能影响孩子健康判断的家族信息', guidance:'仅记录医生建议或可能影响孩子判断的家族背景。', category:'core', icon:'family', activeFor:childProfiles, repeatable:true, fields:[field('relationship','亲属关系'),field('conditions','相关情况','checkbox',{options:['过敏','哮喘','肥胖或代谢问题','遗传性疾病']}),field('other','其他医生建议记录的家族情况','textarea'),note] }
]


export const healthProfileSectionMap = Object.fromEntries(healthProfileSections.map((section) => [section.id, section])) as Record<HealthProfileSectionId, HealthProfileSectionConfig>
