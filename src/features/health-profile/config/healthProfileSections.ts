import type { HealthProfileType } from './healthProfileTemplates'

export type HealthProfileSectionId =
  | 'basic' | 'allergy' | 'medication' | 'chronic' | 'surgery' | 'hospitalization'
  | 'transfusion' | 'examination' | 'vaccination' | 'family-history' | 'sleep'
  | 'diet' | 'exercise' | 'smoking' | 'alcohol' | 'exposure' | 'mental'
  | 'vision-hearing' | 'oral' | 'birth' | 'growth' | 'feeding' | 'menstrual'
  | 'pregnancy' | 'mobility' | 'fall'

export type HealthProfileFieldType = 'text' | 'number' | 'date' | 'time' | 'textarea' | 'select' | 'checkbox' | 'computed' | 'attachment'
export type HealthProfileSectionCategory = 'core' | 'lifestyle' | 'long-term' | 'child' | 'female' | 'elder'

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

const all: HealthProfileType[] = ['infant', 'child', 'teen', 'adult-female', 'adult-male', 'elder-female', 'elder-male']
const adults: HealthProfileType[] = ['adult-female', 'adult-male', 'elder-female', 'elder-male']
const children: HealthProfileType[] = ['infant', 'child', 'teen']
const menstrualProfiles: HealthProfileType[] = ['teen', 'adult-female']
const elder: HealthProfileType[] = ['elder-female', 'elder-male']
const yn = ['是', '否']
const field = (id: string, label: string, type: HealthProfileFieldType = 'text', extra: Partial<HealthProfileField> = {}): HealthProfileField => ({ id, label, type, ...extra })
const note = field('note', '补充说明', 'textarea')
const attachment = field('attachment', '附件', 'attachment')

export const healthProfileSections: HealthProfileSectionConfig[] = [
  { id:'basic', title:'基础健康信息', description:'身高、体重、体脂与血型等基础健康资料', guidance:'记录长期有效的基础身体信息即可。', category:'core', icon:'file', activeFor:all, fields: [
    field('height','身高','number',{unit:'cm'}), field('weight','体重','number',{unit:'kg'}), field('bmi','BMI','computed'), field('waistCircumference','腰围','number',{unit:'cm'}), field('bodyFatPercentage','体脂率','number',{unit:'%'}),
    field('combinedBloodType','血型','select',{options:['A+','A-','B+','B-','AB+','AB-','O+','O-']}) ] },
  { id:'allergy', title:'过敏与不良反应', description:'药物、食物和环境相关的过敏记录', guidance:'记录明确发生过或仍需注意的反应即可。', category:'core', icon:'allergy', activeFor:all, repeatable:true, fields:[field('type','类型','select',{options:['药物','食物','环境','接触','其他']}),field('name','名称'),field('reaction','出现过什么反应','textarea'),field('firstFoundAt','首次发现时间','date'),field('active','是否仍需注意','select',{options:yn}),note] },
  { id:'medication', title:'长期用药', description:'长期使用的药物及用法', guidance:'记录长期或持续使用的药物，不必填写临时用药。', category:'core', icon:'pill', activeFor:all, repeatable:true, fields:[field('name','药物名称'),field('reason','使用原因'),field('dosage','用法用量'),field('frequency','使用频率'),field('startedAt','开始时间','date'),field('active','当前是否仍使用','select',{options:yn}),note] },
  { id:'chronic', title:'慢性病与长期健康问题', description:'长期存在或需要持续管理的健康问题', guidance:'使用日常理解的名称即可，不要求填写医学确诊。', category:'core', icon:'heart', activeFor:all, repeatable:true, fields:[field('name','疾病 / 问题名称'),field('firstFoundAt','首次发现时间','date'),field('status','当前状态','select',{options:['稳定','持续中','持续治疗中','已缓解']}),field('impact','主要影响 / 表现','textarea'),field('management','当前管理情况','textarea'),note] },
  { id:'surgery', title:'手术史', description:'重要手术经历与恢复情况', guidance:'记录你认为重要的手术经历即可。', category:'core', icon:'stethoscope', activeFor:all, repeatable:true, fields:[field('name','手术名称'),field('date','手术时间','date'),field('hospital','医院'),field('reason','手术原因'),field('recovery','恢复情况','textarea'),attachment,note] },
  { id:'hospitalization', title:'住院 / 急诊史', description:'住院与急诊的重要经历', guidance:'记录对长期健康有帮助的重要就医经历。', category:'core', icon:'stethoscope', activeFor:all, repeatable:true, fields:[field('type','类型','select',{options:['住院','急诊']}),field('reason','原因'),field('hospital','医院'),field('date','时间','date'),field('treatment','主要处理','textarea'),field('result','结果','textarea'),attachment,note] },
  { id:'transfusion', title:'输血史', description:'输血时间、原因与相关反应', guidance:'如有输血经历，可记录其中的重要信息。', category:'core', icon:'heart', activeFor:all, repeatable:true, fields:[field('date','时间','date'),field('reason','原因'),field('location','地点'),field('reaction','是否出现不良反应','select',{options:yn}),note] },
  { id:'examination', title:'检查 / 体检报告', description:'体检、化验和影像结果', guidance:'保存重要检查的摘要；附件能力后续开放。', category:'long-term', icon:'stethoscope', activeFor:all, repeatable:true, fields:[field('name','检查名称'),field('type','类型','select',{options:['体检','化验','B超','CT','MRI','X光','心电图','内镜','病理','其他']}),field('date','时间','date'),field('organization','机构'),field('summary','结果摘要','textarea'),attachment,note] },
  { id:'vaccination', title:'疫苗接种史', description:'疫苗名称、剂次与接种记录', guidance:'记录已完成或仍在进行的接种信息。', category:'core', icon:'syringe', activeFor:all, repeatable:true, fields:[field('name','疫苗名称'),field('dose','剂次'),field('date','接种时间','date'),field('organization','接种机构'),field('completed','是否完成全程','select',{options:yn}),field('reaction','接种后情况','textarea'),note] },
  { id:'family-history', title:'家族遗传史', description:'家族成员的重要疾病情况', guidance:'可记录父母、兄弟姐妹及祖辈的重要疾病情况。', category:'core', icon:'family', activeFor:all, repeatable:true, fields:[field('relationship','家庭成员关系'),field('disease','疾病 / 健康问题'),field('age','大概发病年龄','number',{unit:'岁'}),field('similar','是否有其他亲属也有类似情况','select',{options:yn}),note] },
  { id:'sleep', title:'睡眠情况', description:'长期睡眠习惯与问题', guidance:'记录平时长期状态即可，不需要每天填写。', category:'lifestyle', icon:'sleep', activeFor:all, fields:[field('bedtime','通常入睡时间','time'),field('wakeTime','通常起床时间','time'),field('duration','平均睡眠时长','number',{unit:'小时'}),field('wakeEasy','是否容易醒','select',{options:yn}),field('longTermProblem','是否长期存在睡眠问题','select',{options:yn}),field('snore','是否打鼾','select',{options:yn}),note] },
  { id:'diet', title:'饮食习惯', description:'长期饮食偏好与规律', guidance:'记录长期习惯即可，不需要记录每一餐。', category:'lifestyle', icon:'utensils', activeFor:all, fields:[field('preference','饮食偏好','textarea'),field('specialDiet','是否有特殊饮食','textarea'),field('avoid','是否忌口','textarea'),field('appetite','食欲长期情况'),field('regularity','饮食规律'),note] },
  { id:'exercise', title:'运动情况', description:'常见运动方式与活动限制', guidance:'记录平时大致活动情况即可。', category:'lifestyle', icon:'activity', activeFor:all, fields:[field('type','常见运动方式'),field('frequency','每周大概频率'),field('duration','每次大概时长'),field('limitation','是否有长期活动限制','select',{options:yn}),note] },
  { id:'smoking', title:'吸烟情况', description:'当前及过去的吸烟情况', guidance:'此信息用于长期健康背景记录。', category:'lifestyle', icon:'activity', activeFor:adults, fields:[field('status','吸烟情况','select',{options:['从不','当前吸烟','曾吸烟，已戒']}),field('dailyAmount','每天大概数量'),field('startedAge','开始年龄','number',{unit:'岁'}),field('quitDate','戒烟时间','date')] },
  { id:'alcohol', title:'饮酒情况', description:'当前及过去的饮酒情况', guidance:'记录长期习惯即可，不需要逐次记录。', category:'lifestyle', icon:'activity', activeFor:adults, fields:[field('status','饮酒情况','select',{options:['不饮酒','偶尔','经常','已戒酒']}),field('frequency','大概频率'),note] },
  { id:'exposure', title:'职业与环境暴露', description:'长期接触的职业或生活环境', guidance:'可记录长期接触粉尘、噪声、化学品或其他特殊环境的情况。', category:'lifestyle', icon:'activity', activeFor:all, repeatable:true, fields:[field('type','类型','select',{options:['粉尘','化学品','噪声','辐射','二手烟','高温 / 低温','其他']}),field('duration','大概持续时间'),field('scene','工作 / 生活场景'),note] },
  { id:'mental', title:'心理与情绪健康', description:'长期情绪状态与支持经历', guidance:'只记录你愿意保留的长期背景信息。', category:'long-term', icon:'heart', activeFor:all, fields:[field('longTermImpact','是否有长期影响生活的情绪问题','select',{options:yn}),field('consultation','是否有心理咨询经历','select',{options:yn}),field('diagnosis','是否有明确诊断','select',{options:yn}),field('active','当前是否仍在关注','select',{options:yn}),note] },
  { id:'vision-hearing', title:'视力与听力', description:'长期视力和听力情况', guidance:'记录长期问题、辅助设备和重要检查即可。', category:'long-term', icon:'file', activeFor:all, fields:[field('visionProblem','是否存在长期视力问题','select',{options:yn}),field('glasses','是否佩戴眼镜','select',{options:yn}),field('visionExam','是否做过重要视力检查','select',{options:yn}),field('hearingLoss','是否有听力下降','select',{options:yn}),field('hearingAid','是否使用助听器','select',{options:yn}),field('hearingExam','是否做过重要听力检查','select',{options:yn})] },
  { id:'oral', title:'口腔与牙齿', description:'长期牙齿与口腔健康背景', guidance:'记录长期问题和重要治疗经历即可。', category:'long-term', icon:'file', activeFor:all, fields:[field('problem','是否有长期牙齿 / 牙周问题','select',{options:yn}),field('orthodontics','是否做过矫正','select',{options:yn}),field('denture','是否有义齿','select',{options:yn}),field('treatment','是否做过重要牙科治疗','select',{options:yn}),note] },
  { id:'birth', title:'出生资料', description:'孕周、出生体重与分娩情况', guidance:'记录出生阶段的重要资料。', category:'child', icon:'baby', activeFor:children, fields:[field('gestationalWeeks','孕周','number',{unit:'周'}),field('birthWeight','出生体重','number',{unit:'kg'}),field('birthLength','出生身长','number',{unit:'cm'}),field('delivery','分娩方式','select',{options:['顺产','剖宫产','其他']}),field('premature','是否早产','select',{options:yn}),field('neonatal','新生儿时期重要情况','textarea'),attachment] },
  { id:'growth', title:'儿童成长发育', description:'身高、体重、头围与发育变化', guidance:'按需要补充阶段性生长记录。', category:'child', icon:'activity', activeFor:children, repeatable:true, fields:[field('date','日期','date'),field('height','身高 / 身长','number',{unit:'cm'}),field('weight','体重','number',{unit:'kg'}),field('headCircumference','头围','number',{unit:'cm'}),field('note','发育情况备注','textarea')] },
  { id:'feeding', title:'喂养 / 辅食', description:'喂养方式、辅食和食物反应', guidance:'记录当前阶段的主要喂养情况。', category:'child', icon:'utensils', activeFor:['infant','child'], fields:[field('method','喂养方式','select',{options:['母乳','配方奶','混合喂养','其他']}),field('milkAmount','大概奶量','number',{unit:'ml'}),field('frequency','喂养频率'),field('solidStartedAt','辅食开始时间','date'),field('mainFood','当前主要食物','textarea'),field('foodReaction','食物反应','textarea'),note] },
  { id:'menstrual', title:'月经健康', description:'长期周期、经量与不适情况', guidance:'记录长期规律和需要关注的变化即可。', category:'female', icon:'calendar', activeFor:menstrualProfiles, fields:[field('menarche','初潮时间','date'),field('regular','周期是否规律','select',{options:yn}),field('cycle','平均周期','number',{unit:'天'}),field('duration','经期时长','number',{unit:'天'}),field('flow','经量情况','select',{options:['较少','一般','较多']}),field('pain','是否痛经','select',{options:yn}),field('abnormal','其他长期异常情况','textarea')] },
  { id:'pregnancy', title:'孕产健康', description:'妊娠与分娩的重要经历', guidance:'每次孕产经历可单独记录。', category:'female', icon:'calendar', activeFor:['adult-female'], repeatable:true, fields:[field('date','时间','date'),field('result','妊娠结果'),field('weeks','孕周','number',{unit:'周'}),field('delivery','分娩方式'),field('situation','重要情况','textarea'),field('hospital','医院'),attachment] },
  { id:'mobility', title:'行动与生活能力', description:'行动、自理能力与照护信息', guidance:'记录当前长期状态和实际需要的协助。', category:'elder', icon:'care', activeFor:elder, fields:[field('walk','是否可独立行走','select',{options:yn}),field('assistiveDevice','是否需要辅助工具','select',{options:yn}),field('dressing','是否需要他人协助穿衣','select',{options:yn}),field('bathing','是否需要他人协助洗澡','select',{options:yn}),field('eating','是否需要他人协助进食','select',{options:yn}),field('caregiver','主要照护人'),note] },
  { id:'fall', title:'跌倒史', description:'跌倒经过、受伤与就医情况', guidance:'每次重要跌倒经历可单独记录。', category:'elder', icon:'care', activeFor:elder, repeatable:true, fields:[field('date','时间','date'),field('location','地点'),field('event','当时发生什么','textarea'),field('injury','是否受伤','select',{options:yn}),field('medicalCare','是否就医','select',{options:yn}),note] }
]

export const healthProfileSectionMap = Object.fromEntries(healthProfileSections.map((section) => [section.id, section])) as Record<HealthProfileSectionId, HealthProfileSectionConfig>
