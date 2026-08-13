export type HealthProfileSectionId =
  | 'basic' | 'growth' | 'feeding' | 'sleep' | 'allergy' | 'medication' | 'history'
  | 'examination' | 'vaccination' | 'indicators' | 'menstrual' | 'care' | 'family-history' | 'birth'

export type HealthProfileFieldType = 'text' | 'number' | 'date' | 'time' | 'textarea' | 'select' | 'checkbox'

export interface HealthProfileField {
  id: string
  label: string
  type: HealthProfileFieldType
  options?: string[]
  placeholder?: string
  unit?: string
}

export interface HealthProfileSectionConfig {
  id: HealthProfileSectionId
  title: string
  description: string
  icon: 'activity' | 'allergy' | 'baby' | 'calendar' | 'care' | 'family' | 'file' | 'heart' | 'pill' | 'sleep' | 'stethoscope' | 'syringe' | 'utensils'
  activeFor: HealthProfileType[]
  historicalFor?: HealthProfileType[]
  historicalLabel?: string
  fields: HealthProfileField[]
}

import type { HealthProfileType } from './healthProfileTemplates'

const allProfileTypes: HealthProfileType[] = ['infant', 'child', 'teen', 'adult-female', 'adult-male', 'elder-female', 'elder-male']
const adultAndElderTypes: HealthProfileType[] = ['adult-female', 'adult-male', 'elder-female', 'elder-male']

export const healthProfileSections: HealthProfileSectionConfig[] = [
  { id: 'basic', title: '基础信息', description: '身高、体重、血型等基础资料', icon: 'file', activeFor: allProfileTypes, fields: [
    { id: 'height', label: '身高', type: 'number', unit: 'cm' },
    { id: 'weight', label: '体重', type: 'number', unit: 'kg' }, { id: 'bloodType', label: '血型', type: 'select', options: ['A', 'B', 'AB', 'O', '未知'] },
  ] },
  { id: 'growth', title: '生长发育', description: '身长、体重、头围与发育变化', icon: 'activity', activeFor: ['infant', 'child'], historicalFor: ['teen', ...adultAndElderTypes], historicalLabel: '儿童期', fields: [
    { id: 'height', label: '身高', type: 'number', unit: 'cm' }, { id: 'weight', label: '体重', type: 'number', unit: 'kg' },
    { id: 'headCircumference', label: '头围', type: 'number', unit: 'cm' }, { id: 'note', label: '发育备注', type: 'textarea' }, { id: 'recordedAt', label: '记录时间', type: 'date' },
  ] },
  { id: 'feeding', title: '喂养与辅食', description: '奶量、辅食和食物反应', icon: 'utensils', activeFor: ['infant'], historicalFor: ['child', 'teen', ...adultAndElderTypes], historicalLabel: '婴幼儿期', fields: [
    { id: 'method', label: '喂养方式', type: 'select', options: ['母乳', '配方奶', '混合喂养'] }, { id: 'milkAmount', label: '每日奶量', type: 'number', unit: 'ml' },
    { id: 'frequency', label: '喂养频次', type: 'number', unit: '次/日' }, { id: 'solidFood', label: '辅食添加情况', type: 'textarea' },
    { id: 'foodReaction', label: '食物反应', type: 'textarea' }, { id: 'digestion', label: '大便/吐奶情况', type: 'textarea' }, { id: 'recordedAt', label: '记录时间', type: 'date' },
  ] },
  { id: 'sleep', title: '睡眠与作息', description: '睡眠时长与日常作息规律', icon: 'sleep', activeFor: allProfileTypes, fields: [
    { id: 'bedtime', label: '入睡时间', type: 'time' }, { id: 'wakeTime', label: '起床时间', type: 'time' },
    { id: 'nap', label: '午睡情况', type: 'text' }, { id: 'duration', label: '睡眠时长', type: 'number', unit: '小时' }, { id: 'note', label: '睡眠问题/备注', type: 'textarea' },
  ] },
  { id: 'allergy', title: '过敏史', description: '药物、食物和环境过敏记录', icon: 'allergy', activeFor: allProfileTypes, fields: [
    { id: 'drug', label: '药物过敏', type: 'text' }, { id: 'food', label: '食物过敏', type: 'text' }, { id: 'environment', label: '环境过敏', type: 'text' },
    { id: 'reaction', label: '过敏表现', type: 'textarea' }, { id: 'firstFoundAt', label: '首次发现时间', type: 'date' },
    { id: 'severity', label: '严重程度', type: 'select', options: ['轻微', '中等', '严重'] }, { id: 'note', label: '备注', type: 'textarea' },
  ] },
  { id: 'medication', title: '长期用药', description: '长期使用的药物及用法', icon: 'pill', activeFor: allProfileTypes, fields: [
    { id: 'name', label: '药物名称', type: 'text' }, { id: 'reason', label: '用药原因', type: 'text' }, { id: 'dosage', label: '用法用量', type: 'text' },
    { id: 'startedAt', label: '开始时间', type: 'date' }, { id: 'active', label: '仍在使用', type: 'checkbox' }, { id: 'note', label: '备注', type: 'textarea' },
  ] },
  { id: 'history', title: '既往病史', description: '过往疾病、治疗和当前状态', icon: 'heart', activeFor: allProfileTypes, fields: [
    { id: 'disease', label: '疾病名称', type: 'text' }, { id: 'diagnosedAt', label: '诊断时间', type: 'date' },
    { id: 'status', label: '当前状态', type: 'select', options: ['已康复', '持续中', '观察中'] }, { id: 'treatment', label: '相关治疗', type: 'textarea' }, { id: 'note', label: '备注', type: 'textarea' },
  ] },
  { id: 'examination', title: '检查与检验', description: '体检、化验和影像结果', icon: 'stethoscope', activeFor: allProfileTypes, fields: [
    { id: 'name', label: '检查名称', type: 'text' }, { id: 'date', label: '检查时间', type: 'date' }, { id: 'organization', label: '检查机构', type: 'text' },
    { id: 'summary', label: '结果摘要', type: 'textarea' }, { id: 'attachment', label: '附件/图片说明', type: 'text', placeholder: '附件能力后续开放' }, { id: 'note', label: '备注', type: 'textarea' },
  ] },
  { id: 'vaccination', title: '预防接种', description: '疫苗名称、剂次与接种记录', icon: 'syringe', activeFor: allProfileTypes, fields: [
    { id: 'name', label: '疫苗名称', type: 'text' }, { id: 'dose', label: '接种剂次', type: 'text' }, { id: 'date', label: '接种日期', type: 'date' },
    { id: 'location', label: '接种地点', type: 'text' }, { id: 'note', label: '备注', type: 'textarea' },
  ] },
  { id: 'indicators', title: '关键健康指标', description: '血压、血糖、心率和体温趋势', icon: 'activity', activeFor: ['teen', ...adultAndElderTypes], fields: [
    { id: 'bloodPressure', label: '血压', type: 'text', placeholder: '例如 120/80 mmHg' }, { id: 'bloodSugar', label: '血糖', type: 'number', unit: 'mmol/L' },
    { id: 'heartRate', label: '心率', type: 'number', unit: '次/分' }, { id: 'temperature', label: '体温', type: 'number', unit: '℃' },
    { id: 'weight', label: '体重', type: 'number', unit: 'kg' }, { id: 'note', label: '备注', type: 'textarea' }, { id: 'recordedAt', label: '记录时间', type: 'date' },
  ] },
  { id: 'menstrual', title: '月经健康', description: '周期、经量和异常情况记录', icon: 'calendar', activeFor: ['teen', 'adult-female'], historicalFor: ['elder-female'], historicalLabel: '育龄期', fields: [
    { id: 'cycle', label: '周期', type: 'number', unit: '天' }, { id: 'flow', label: '经量', type: 'select', options: ['少', '正常', '多'] },
    { id: 'pain', label: '痛经情况', type: 'select', options: ['无', '轻微', '明显'] }, { id: 'lastDate', label: '最近一次日期', type: 'date' }, { id: 'note', label: '异常情况备注', type: 'textarea' },
  ] },
  { id: 'care', title: '功能与照护', description: '行动能力、跌倒风险与照护信息', icon: 'care', activeFor: ['elder-female', 'elder-male'], fields: [
    { id: 'mobility', label: '行动能力', type: 'select', options: ['独立', '需要辅助', '无法独立'] }, { id: 'falls', label: '跌倒记录', type: 'textarea' },
    { id: 'cognition', label: '认知情况', type: 'textarea' }, { id: 'sleep', label: '睡眠情况', type: 'textarea' },
    { id: 'caregiver', label: '主要照护人', type: 'text' }, { id: 'note', label: '照护备注', type: 'textarea' },
  ] },
  { id: 'family-history', title: '家族健康史', description: '家庭成员的重要健康信息', icon: 'family', activeFor: allProfileTypes, fields: [
    { id: 'relationship', label: '家庭成员关系', type: 'text' }, { id: 'disease', label: '疾病名称', type: 'text' },
    { id: 'impact', label: '影响说明', type: 'textarea' }, { id: 'note', label: '备注', type: 'textarea' },
  ] },
  { id: 'birth', title: '出生资料', description: '出生体重、孕周与分娩情况', icon: 'baby', activeFor: ['infant'], historicalFor: ['child', 'teen', ...adultAndElderTypes], historicalLabel: '出生期', fields: [
    { id: 'birthday', label: '出生日期', type: 'date' }, { id: 'birthWeight', label: '出生体重', type: 'number', unit: 'kg' },
    { id: 'gestationalWeeks', label: '孕周', type: 'number', unit: '周' }, { id: 'delivery', label: '分娩方式', type: 'select', options: ['顺产', '剖宫产', '其他'] },
    { id: 'note', label: '出生情况备注', type: 'textarea' },
  ] },
]

export const healthProfileSectionMap = Object.fromEntries(healthProfileSections.map((section) => [section.id, section])) as Record<HealthProfileSectionId, HealthProfileSectionConfig>
