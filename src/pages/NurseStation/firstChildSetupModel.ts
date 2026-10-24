import type { ChildRecorderRelationship } from '../../types'
import { childBirthdayErrorMessage, validateChildBirthday } from '../../utils/childProfile'
import { childAvatarVariants, type ChildAvatarVariant } from '../../utils/childAvatar'

export const childSetupFields = ['name', 'birthday', 'gender', 'recorder'] as const
export type ChildSetupField = typeof childSetupFields[number]
export type ChildSetupStep = ChildSetupField | 'review'
export const childRecorderOptions = [
  ['father', '爸爸'], ['mother', '妈妈'], ['paternal_grandfather', '爷爷'],
  ['paternal_grandmother', '奶奶'], ['maternal_grandfather', '外公'],
  ['maternal_grandmother', '外婆'], ['nanny', '保姆'], ['other', '其他']
] as const satisfies readonly (readonly [ChildRecorderRelationship, string])[]
export const childSetupLabels: Record<ChildSetupField, string> = { name: '姓名', birthday: '出生日期', gender: '性别', recorder: '与孩子的关系' }
export interface FirstChildDraft {
  name: string; birthday: string; gender: '' | 'male' | 'female'
  recorder: '' | ChildRecorderRelationship; variant: ChildAvatarVariant
  step: ChildSetupStep; text: string; typing: boolean
}
export const newFirstChildDraft = (): FirstChildDraft => ({ name: '', birthday: '', gender: '', recorder: '', variant: 'east-asian', step: 'name', text: '', typing: false })
export const firstChildStorageKey = (accountId: string) => `hoooho:first-child:v1:${accountId}`
export const firstChildVoiceKey = (accountId: string, field: ChildSetupField) => `first-child:${accountId}:${field}`
export const recorderLabel = (value: FirstChildDraft['recorder']) => childRecorderOptions.find(([id]) => id === value)?.[1] ?? ''

function chineseNumber(value: string) {
  const digits = '零一二三四五六七八九'
  if (/^[零〇一二两三四五六七八九]{4}$/.test(value)) return [...value].map(c => c === '〇' ? 0 : c === '两' ? 2 : digits.indexOf(c)).join('')
  if (value.includes('十')) { const [tens, ones] = value.split('十'); return String((tens ? digits.indexOf(tens) : 1) * 10 + (ones ? digits.indexOf(ones) : 0)) }
  return value === '两' ? '2' : String(digits.indexOf(value))
}
export function parseChildBirthday(text: string) {
  const normalized = text.replace(/[零〇一二两三四五六七八九十]+(?=[年月日号])/g, chineseNumber)
  const matches = [...normalized.matchAll(/(?:^|[^\d])(\d{4})\s*(?:年|[-/.])\s*(\d{1,2})\s*(?:月|[-/.])\s*(\d{1,2})(?:日|号)?(?!\d)/g)]
  const match = matches.length === 1 ? matches[0] : null
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : ''
}
export function parseFirstChildAnswer(field: ChildSetupField, text: string, today = new Date()): { value: string; error?: never } | { error: string; value?: never } {
  const raw = text.trim().replace(/[。！!，,]+$/, '')
  if (field === 'name') {
    const value = raw.replace(/^(?:(?:孩子|宝宝|他|她)的?)?(?:姓名是|名字叫|名字是|小名叫|叫做|叫)\s*/, '').trim()
    return !value ? { error: '告诉我孩子的姓名或小名就好。' } : value.length > 50 ? { error: '姓名最多50个字符，可以先用平时的小名。' } : { value }
  }
  if (field === 'birthday') {
    const value = parseChildBirthday(raw)
    if (!value) return { error: '需要准确的出生年月日，例如2024年1月15日，也可以点选日期。' }
    const result = validateChildBirthday(value, today)
    return result.valid ? { value } : { error: childBirthdayErrorMessage(result.error) }
  }
  if (field === 'gender') {
    if (/不|没|可能|大概|也许|好像|似乎|或者|还是/.test(raw)) return { error: '请明确选择男孩或女孩，我先不替你判断。' }
    const male = /男|儿子/.test(raw), female = /女/.test(raw)
    return male !== female ? { value: female ? 'female' : 'male' } : { error: '孩子是男孩还是女孩？也可以点下面的选项。' }
  }
  const value = raw.replace(/^我(?:是|是她的|是他的)/, '').replace(/^(?:孩子|宝宝|他|她)的/, '').replace(/\s/g, '')
  const option = childRecorderOptions.find(([, label]) => label === value)
  return option ? { value: option[0] } : { error: '你是孩子的哪位照顾者？可以从下面选择。' }
}
export function firstIncompleteField(draft: FirstChildDraft, today = new Date()): ChildSetupStep {
  if (!draft.name.trim() || draft.name.trim().length > 50) return 'name'
  if (!draft.birthday || !validateChildBirthday(draft.birthday, today).valid) return 'birthday'
  if (draft.gender !== 'male' && draft.gender !== 'female') return 'gender'
  if (!childRecorderOptions.some(([id]) => id === draft.recorder)) return 'recorder'
  return 'review'
}
export function restoreFirstChildDraft(value: unknown, today = new Date()): FirstChildDraft {
  const empty = newFirstChildDraft()
  if (!value || typeof value !== 'object') return empty
  const source = value as Partial<FirstChildDraft>
  const draft: FirstChildDraft = { ...empty,
    name: typeof source.name === 'string' ? source.name.slice(0, 50) : '',
    birthday: typeof source.birthday === 'string' ? source.birthday : '',
    gender: source.gender === 'male' || source.gender === 'female' ? source.gender : '',
    recorder: childRecorderOptions.some(([id]) => id === source.recorder) ? source.recorder! : '',
    variant: childAvatarVariants.includes(source.variant!) ? source.variant! : empty.variant,
    text: typeof source.text === 'string' ? source.text.slice(0, 240) : '', typing: source.typing === true
  }
  const missing = firstIncompleteField(draft, today)
  draft.step = missing === 'review' && childSetupFields.includes(source.step as ChildSetupField) ? source.step as ChildSetupField : missing
  return draft
}
