import type { HealthProfileSectionId } from './healthProfileSections'

export type ProfileValue = string | string[] | boolean
export type ProfileValues = Record<string, ProfileValue>
export type ProfileFieldKind = 'text' | 'textarea' | 'date' | 'time' | 'number' | 'single' | 'multi' | 'tags' | 'attachment'
export type ProfileExperienceMode = 'portrait' | 'history' | 'library' | 'relationship' | 'matrix' | 'timeline' | 'profile'

export interface ProfileVisibility {
  field: string
  values: string[]
}

export interface ProfileExperienceField {
  id: string
  label: string
  kind: ProfileFieldKind
  group?: string
  options?: string[]
  placeholder?: string
  unit?: string
  visibleWhen?: ProfileVisibility
}

export interface ProfileExperienceDefinition {
  id: Exclude<HealthProfileSectionId, 'basic' | 'allergy' | 'medication' | 'chronic' | 'surgery'>
  mode: ProfileExperienceMode
  repeatable: boolean
  addLabel?: string
  emptyTitle?: string
  emptyDescription?: string
  fields: ProfileExperienceField[]
}

const text = (id: string, label: string, group?: string, placeholder?: string): ProfileExperienceField => ({ id, label, kind: 'text', group, placeholder })
const area = (id: string, label: string, group?: string, placeholder?: string): ProfileExperienceField => ({ id, label, kind: 'textarea', group, placeholder })
const date = (id: string, label: string, group?: string): ProfileExperienceField => ({ id, label, kind: 'date', group })
const time = (id: string, label: string, group?: string): ProfileExperienceField => ({ id, label, kind: 'time', group })
const number = (id: string, label: string, unit: string, group?: string): ProfileExperienceField => ({ id, label, kind: 'number', unit, group })
const single = (id: string, label: string, options: string[], group?: string, visibleWhen?: ProfileVisibility): ProfileExperienceField => ({ id, label, kind: 'single', options, group, visibleWhen })
const multi = (id: string, label: string, options: string[], group?: string, visibleWhen?: ProfileVisibility): ProfileExperienceField => ({ id, label, kind: 'multi', options, group, visibleWhen })
const tags = (id: string, label: string, group?: string, placeholder?: string): ProfileExperienceField => ({ id, label, kind: 'tags', group, placeholder })
const attachment = (id: string, label: string, group?: string): ProfileExperienceField => ({ id, label, kind: 'attachment', group })

export const profileSectionExperiences: ProfileExperienceDefinition[] = [
  { id: 'hospitalization', mode: 'history', repeatable: true, addLabel: '添加一次就医经历', emptyTitle: '暂无住院或急诊经历', emptyDescription: '有需要长期保留的重要就医经历时再添加即可。', fields: [
    single('type', '就医类型', ['住院', '急诊'], '主要信息'), date('date', '日期', '主要信息'), text('hospital', '医院', '主要信息'), text('reason', '就医原因 / 当时主要问题', '主要信息'), area('treatment', '主要检查 / 处理', '经过'), area('result', '主要结果 / 出院情况', '经过'), attachment('attachment', '出院小结 / 检查资料', '资料')
  ] },
  { id: 'transfusion', mode: 'history', repeatable: true, addLabel: '添加一次输血经历', emptyTitle: '暂无输血记录', emptyDescription: '有过输血经历时再添加即可。', fields: [
    date('date', '时间', '输血经历'), text('location', '医院 / 地点', '输血经历'), text('reason', '为什么输血', '输血经历'), multi('products', '输注内容', ['红细胞', '血小板', '血浆', '全血', '其他'], '输血经历'), single('reactionStatus', '当时是否出现反应', ['没有明显反应', '出现过反应'], '输血反应'), multi('reactions', '出现过哪些反应', ['发热', '寒战', '皮疹', '呼吸不适', '其他'], '输血反应', { field: 'reactionStatus', values: ['出现过反应'] }), area('note', '补充说明', '输血反应')
  ] },
  { id: 'examination', mode: 'library', repeatable: true, addLabel: '手动添加检查', emptyTitle: '还没有检查或体检报告', emptyDescription: '可以先上传原报告，附件能力开放前也可手动保存摘要。', fields: [
    text('name', '检查名称', '报告信息'), single('type', '类型', ['体检', '化验', '超声', 'CT', 'MRI', 'X 光', '心电图', '内镜', '病理', '其他'], '报告信息'), date('date', '日期', '报告信息'), text('organization', '医疗机构', '报告信息'), area('summary', '结果摘要', '结果'), attachment('attachment', '原报告', '资料'), area('note', '补充说明', '资料')
  ] },
  { id: 'vaccination', mode: 'timeline', repeatable: true, addLabel: '添加一条接种记录', emptyTitle: '还没有疫苗接种记录', emptyDescription: '选择疫苗后，可以继续追加不同剂次。', fields: [
    text('name', '疫苗名称', '疫苗'), text('dose', '剂次', '疫苗', '例如：第 1 剂'), date('date', '接种时间', '接种信息'), text('organization', '接种机构', '接种信息'), area('reaction', '接种后重要反应', '接种信息'), area('note', '补充说明', '接种信息')
  ] },
  { id: 'family-history', mode: 'relationship', repeatable: true, addLabel: '添加一位亲属的健康情况', emptyTitle: '还没有家族健康记录', emptyDescription: '先选择亲属，再记录这个亲属值得长期保留的健康问题。', fields: [
    single('relationship', '亲属', ['父亲', '母亲', '兄弟姐妹', '子女', '祖父', '祖母', '外祖父', '外祖母', '其他'], '亲属'), tags('conditions', '健康问题（可添加多个）', '健康问题', '输入后按回车添加'), text('age', '大概发现 / 发病年龄', '健康问题', '例如：45 岁或 40 多岁'), single('diagnosed', '是否属于明确诊断', ['是', '不确定'], '健康问题'), area('note', '补充说明', '健康问题')
  ] },
  { id: 'sleep', mode: 'portrait', repeatable: false, fields: [
    time('bedtime', '通常入睡时间', '典型睡眠'), time('wakeTime', '通常起床时间', '典型睡眠'), multi('problems', '睡眠中有没有这些情况', ['入睡困难', '容易醒', '醒得很早', '睡醒仍然很累', '打鼾', '憋醒 / 呼吸不畅', '夜间频繁起床', '做梦较多', '其他'], '睡眠状态'), single('quality', '大多数时候睡得怎么样', ['很好', '还可以', '不太好', '很差'], '睡眠状态'), area('note', '补充说明（选填）', '睡眠状态')
  ] },
  { id: 'diet', mode: 'portrait', repeatable: false, fields: [
    single('regularity', '平时饮食规律', ['规律', '基本规律', '经常不规律'], '饮食画像'), multi('patterns', '主要饮食方式', ['普通饮食', '偏素', '素食', '低盐', '低脂', '低糖', '高蛋白', '其他'], '饮食画像'), single('appetite', '食欲通常', ['好', '一般', '较差', '变化较大'], '饮食画像'), tags('avoidFoods', '主动避免的食物', '饮食画像', '输入后按回车添加'), area('note', '补充说明（选填）', '饮食画像')
  ] },
  { id: 'exercise', mode: 'portrait', repeatable: false, fields: [
    multi('activities', '平时主要怎么活动', ['步行', '跑步', '骑行', '游泳', '健身 / 力量训练', '球类', '瑜伽 / 拉伸', '体力劳动', '很少运动', '其他'], '活动画像'), single('frequency', '每周大概频率', ['不到 1 次', '1–2 次', '3–4 次', '5 次以上'], '活动画像'), single('duration', '每次通常', ['少于 20 分钟', '20–40 分钟', '40–60 分钟', '超过 60 分钟'], '活动画像'), single('intensity', '通常强度', ['轻松', '中等', '比较吃力'], '活动画像'), single('limitationStatus', '有没有限制活动的问题', ['没有明显限制', '有一些限制'], '活动限制'), multi('limitations', '具体限制', ['走路受限', '跑跳受限', '上下楼困难', '关节疼痛', '呼吸不适', '心脏原因', '容易疲劳', '平衡问题', '其他'], '活动限制', { field: 'limitationStatus', values: ['有一些限制'] })
  ] },
  { id: 'smoking', mode: 'portrait', repeatable: false, fields: [
    single('status', '吸烟情况', ['从不吸烟', '目前吸烟', '以前吸烟，已戒'], '吸烟暴露'), { ...number('dailyAmount', '每天大约多少支', '支', '吸烟暴露'), visibleWhen: { field: 'status', values: ['目前吸烟', '以前吸烟，已戒'] } }, { ...number('startedAge', '大约几岁开始', '岁', '吸烟暴露'), visibleWhen: { field: 'status', values: ['目前吸烟', '以前吸烟，已戒'] } }, { ...date('quitDate', '戒烟日期', '吸烟暴露'), visibleWhen: { field: 'status', values: ['以前吸烟，已戒'] } }
  ] },
  { id: 'alcohol', mode: 'portrait', repeatable: false, fields: [
    single('status', '饮酒情况', ['不饮酒', '偶尔', '经常', '已戒酒'], '饮酒画像'), multi('types', '通常喝什么', ['啤酒', '葡萄酒', '白酒 / 烈酒', '其他'], '饮酒画像', { field: 'status', values: ['偶尔', '经常', '已戒酒'] }), single('frequency', '大概多久一次', ['每月少于 1 次', '每月 1–3 次', '每周 1–2 次', '每周 3 次以上'], '饮酒画像', { field: 'status', values: ['偶尔', '经常', '已戒酒'] }), { ...text('amount', '一次大概多少', '饮酒画像', '按你习惯的方式描述'), visibleWhen: { field: 'status', values: ['偶尔', '经常', '已戒酒'] } }
  ] },
  { id: 'exposure', mode: 'history', repeatable: true, addLabel: '添加一项暴露经历', emptyTitle: '暂无职业或环境暴露记录', emptyDescription: '有需要长期保留的工作或生活环境暴露时再添加。', fields: [
    single('type', '暴露类型', ['粉尘', '化学品', '噪声', '辐射', '二手烟', '高温 / 低温', '其他'], '暴露信息'), text('scene', '工作 / 生活场景', '暴露信息'), date('startedAt', '开始时间', '时间'), date('endedAt', '结束时间', '时间'), single('protection', '是否使用防护', ['是', '否', '不适用'], '防护'), area('note', '补充说明', '防护')
  ] },
  { id: 'mental', mode: 'portrait', repeatable: false, fields: [
    multi('states', '较长期的情绪状态', ['整体稳定', '经常焦虑 / 紧张', '持续低落', '情绪波动较大', '睡眠明显受情绪影响', '压力较大', '其他'], '情绪状态'), multi('support', '曾经获得过哪些支持', ['没有', '心理咨询', '精神心理科就诊', '药物治疗', '其他'], '支持经历'), text('diagnosis', '曾被明确告知的诊断（选填）', '支持经历'), single('active', '当前是否仍需要关注', ['是', '目前不用'], '当前状态')
  ] },
  { id: 'vision-hearing', mode: 'matrix', repeatable: false, fields: [
    text('leftVision', '左眼裸眼视力', '视力'), multi('leftVisionIssues', '左眼情况', ['近视', '远视', '散光'], '视力'), text('leftDegree', '左眼度数', '视力'), text('rightVision', '右眼裸眼视力', '视力'), multi('rightVisionIssues', '右眼情况', ['近视', '远视', '散光'], '视力'), text('rightDegree', '右眼度数', '视力'), multi('visionAids', '视力辅助 / 经历', ['框架眼镜', '隐形眼镜', '做过视力相关手术'], '视力'), single('leftHearing', '左耳', ['没有明显问题', '有所下降', '明显下降'], '听力'), single('rightHearing', '右耳', ['没有明显问题', '有所下降', '明显下降'], '听力'), multi('hearingSupport', '听力辅助 / 检查', ['使用助听器', '做过重要听力检查'], '听力'), attachment('hearingAttachment', '听力检查资料', '听力')
  ] },
  { id: 'oral', mode: 'matrix', repeatable: false, fields: [
    multi('problems', '当前需要长期注意的问题', ['龋齿', '牙龈出血', '牙周问题', '缺牙', '牙齿松动', '反复口腔溃疡', '其他'], '口腔状态'), multi('treatments', '重要治疗经历', ['正畸', '种植牙', '义齿', '根管治疗', '颌面手术', '其他'], '治疗经历'), text('treatmentDate', '大概日期', '治疗经历'), text('organization', '医疗机构', '治疗经历'), area('note', '补充说明', '治疗经历')
  ] },
  { id: 'birth', mode: 'profile', repeatable: false, fields: [
    date('birthDate', '出生时间', '出生资料'), number('gestationalWeeks', '孕周', '周', '出生资料'), number('gestationalDays', '额外天数', '天', '出生资料'), number('birthWeight', '出生体重', 'kg', '出生身体资料'), number('birthLength', '出生身长', 'cm', '出生身体资料'), single('delivery', '分娩方式', ['顺产', '剖宫产', '助产', '其他'], '出生情况'), area('neonatal', '新生儿时期的重要情况', '出生情况'), attachment('attachment', '出生医学证明 / 新生儿资料', '出生相关资料')
  ] },
  { id: 'growth', mode: 'timeline', repeatable: true, addLabel: '添加一次成长记录', emptyTitle: '还没有成长记录', emptyDescription: '按需要补充阶段性的身高、体重和发育变化。', fields: [
    date('date', '日期', '成长数据'), number('height', '身高 / 身长', 'cm', '成长数据'), number('weight', '体重', 'kg', '成长数据'), number('headCircumference', '头围（适龄儿童）', 'cm', '成长数据'), area('note', '发育备注', '成长数据')
  ] },
  { id: 'feeding', mode: 'portrait', repeatable: false, fields: [
    single('method', '当前主要喂养方式', ['母乳', '配方奶', '混合喂养', '已以普通饮食为主', '其他'], '当前喂养'), { ...number('milkAmount', '每日大致奶量', 'ml', '当前喂养'), visibleWhen: { field: 'method', values: ['母乳', '配方奶', '混合喂养'] } }, { ...text('frequency', '喂养频率', '当前喂养'), visibleWhen: { field: 'method', values: ['母乳', '配方奶', '混合喂养'] } }, single('solidStatus', '是否已添加辅食', ['尚未添加', '已经添加'], '辅食'), { ...date('solidStartedAt', '辅食开始时间', '辅食'), visibleWhen: { field: 'solidStatus', values: ['已经添加'] } }, { ...tags('mainFoods', '当前主要食物', '辅食', '输入后按回车添加'), visibleWhen: { field: 'solidStatus', values: ['已经添加'] } }, area('note', '补充说明', '辅食')
  ] },
  { id: 'menstrual', mode: 'portrait', repeatable: false, fields: [
    text('menarche', '初潮年龄 / 时间', '周期画像'), single('regularity', '周期通常', ['规律', '基本规律', '不规律'], '周期画像'), number('cycle', '平均周期', '天', '周期画像'), number('duration', '经期时长', '天', '周期画像'), single('flow', '经量', ['较少', '一般', '较多', '变化较大'], '周期画像'), multi('symptoms', '常见不适', ['痛经', '腰酸', '头痛', '恶心', '情绪变化', '其他'], '长期关注'), area('abnormal', '其他需要长期关注的情况', '长期关注')
  ] },
  { id: 'pregnancy', mode: 'history', repeatable: true, addLabel: '添加一次妊娠经历', emptyTitle: '还没有孕产健康记录', emptyDescription: '每次妊娠经历可以单独记录。', fields: [
    single('result', '妊娠结果', ['分娩', '自然流产', '人工终止妊娠', '异位妊娠', '其他'], '妊娠经历'), date('date', '日期', '妊娠经历'), { ...number('weeks', '孕周', '周', '分娩信息'), visibleWhen: { field: 'result', values: ['分娩'] } }, { ...number('days', '额外天数', '天', '分娩信息'), visibleWhen: { field: 'result', values: ['分娩'] } }, single('delivery', '分娩方式', ['顺产', '剖宫产', '助产', '其他'], '分娩信息', { field: 'result', values: ['分娩'] }), text('hospital', '医院', '妊娠经历'), area('situation', '重要情况', '妊娠经历'), attachment('attachment', '相关资料', '资料')
  ] },
  { id: 'mobility', mode: 'matrix', repeatable: false, fields: [
    single('walk', '行走', ['独立完成', '需要一些帮助', '主要依赖他人'], '日常生活能力'), single('stairs', '上下楼', ['独立完成', '需要一些帮助', '主要依赖他人'], '日常生活能力'), single('dressing', '穿衣', ['独立完成', '需要一些帮助', '主要依赖他人'], '日常生活能力'), single('bathing', '洗澡', ['独立完成', '需要一些帮助', '主要依赖他人'], '日常生活能力'), single('toileting', '如厕', ['独立完成', '需要一些帮助', '主要依赖他人'], '日常生活能力'), single('eating', '进食', ['独立完成', '需要一些帮助', '主要依赖他人'], '日常生活能力'), multi('assistiveDevices', '使用的辅助工具', ['手杖', '助行器', '轮椅', '其他'], '照护支持'), text('caregiver', '主要照护人', '照护支持')
  ] },
  { id: 'fall', mode: 'history', repeatable: true, addLabel: '添加一次跌倒经历', emptyTitle: '暂无跌倒记录', emptyDescription: '有重要跌倒经历时再添加即可。', fields: [
    date('date', '时间', '跌倒经过'), text('location', '地点', '跌倒经过'), area('event', '当时正在做什么', '跌倒经过'), multi('factors', '当时是否存在这些情况', ['头晕', '绊倒', '失去平衡', '起身时发生', '原因不清楚', '其他'], '跌倒经过'), single('injury', '是否受伤', ['没有受伤', '受伤了'], '后续情况'), text('injuryLocation', '受伤部位', '后续情况'), single('medicalCare', '是否就医', ['是', '否'], '后续情况'), area('note', '补充说明', '后续情况')
  ] }
]

export const profileSectionExperienceMap = Object.fromEntries(profileSectionExperiences.map((item) => [item.id, item])) as Record<ProfileExperienceDefinition['id'], ProfileExperienceDefinition>
