import type { JournalEntry } from '../../pages/HealthEvents/timeViewModel'

export type VaccineRegion = 'mainland' | 'hong-kong' | 'other'
export interface VaccineProgramRow { id: string; name: string; ages: string; note?: string }
export interface VaccineProgram { label: string; version: string; publishedOn: string; verifiedOn: string; sourceTitle: string; sourceUrl: string; rows: VaccineProgramRow[] }

// These are public programme references, not an individual catch-up schedule.
// Never infer a missing vaccination, contraindication or next vaccination date.
export const vaccinePrograms: Record<Exclude<VaccineRegion, 'other'>, VaccineProgram> = {
  mainland: {
    label: '中国大陆', version: '国家免疫规划·2026年版', publishedOn: '2026-07-03', verifiedOn: '2026-10-18',
    sourceTitle: '国家疾控局、国家卫生健康委：国家免疫规划疫苗儿童免疫程序及说明（2026年版）',
    sourceUrl: 'https://www.ndcpa.gov.cn/jbkzzx/c100014/common/content/content_2073005020766703616.html',
    rows: [
      { id: 'hepb', name: '乙肝疫苗', ages: '出生时、1月龄、6月龄', note: '出生剂次及特殊健康状况另有具体要求。' },
      { id: 'bcg', name: '卡介苗', ages: '出生时' },
      { id: 'polio', name: '脊灰疫苗', ages: '2月龄、3月龄：灭活；4月龄、4周岁：减毒活', note: '已接种含脊灰成分的联合疫苗时，由接种单位核对相应剂次。' },
      { id: 'dtap', name: '百白破疫苗', ages: '2、4、6、18月龄及6周岁', note: '2025年起调整的程序；既往接种按原记录核对，不重复安排。' },
      { id: 'mmr', name: '麻腮风疫苗', ages: '8月龄、18月龄' },
      { id: 'je-live', name: '乙脑疫苗·减毒活程序', ages: '8月龄、2周岁', note: '与灭活程序为不同接种路径，不表示两套都需接种。' },
      { id: 'je-inactive', name: '乙脑疫苗·灭活程序', ages: '8月龄2剂（间隔7—10天）、2周岁、6周岁', note: '2026年3月起西藏、青海、新疆及兵团适龄儿童也开展常规接种。' },
      { id: 'meningococcal', name: '流脑疫苗', ages: '6、9月龄：A群；3、6周岁：A群C群' },
      { id: 'hepa-live', name: '甲肝疫苗·减毒活程序', ages: '18月龄', note: '与灭活程序为不同接种路径。' },
      { id: 'hepa-inactive', name: '甲肝疫苗·灭活程序', ages: '18、24月龄' }
    ]
  },
  'hong-kong': {
    label: '中国香港', version: '香港儿童免疫接种计划·0—7岁节选', publishedOn: '2026-07-13', verifiedOn: '2026-10-18',
    sourceTitle: '香港卫生署卫生防护中心：学童免疫注射小组／香港儿童免疫接种计划',
    sourceUrl: 'https://www.chp.gov.hk/sc/features/102121.html',
    rows: [
      { id: 'birth', name: '卡介苗、乙肝疫苗第1剂', ages: '出生时' },
      { id: 'month1', name: '乙肝疫苗第2剂', ages: '1月龄' },
      { id: 'month2', name: '四合一疫苗第1剂、肺炎球菌疫苗第1剂', ages: '2月龄', note: '四合一：白喉、破伤风、无细胞百日咳及灭活脊灰混合疫苗。' },
      { id: 'month4', name: '四合一疫苗第2剂、肺炎球菌疫苗第2剂', ages: '4月龄' },
      { id: 'month6', name: '四合一疫苗第3剂、乙肝疫苗第3剂', ages: '6月龄' },
      { id: 'month12', name: '麻腮风第1剂、肺炎球菌加强剂、水痘第1剂', ages: '12月龄' },
      { id: 'month18', name: '四合一加强剂、麻腮风水痘混合疫苗', ages: '18月龄', note: '2018年7月1日或以后出生儿童采用18月龄麻腮风水痘混合疫苗安排；较早出生队列有不同安排。' },
      { id: 'school1', name: '四合一加强剂；按出生队列核对麻腮风水痘混合疫苗', ages: '小学一年级', note: '请按学童免疫注射小组的实际通知核对。' }
    ]
  }
}

export const vaccinePlanReadiness = { ready: false, reason: '地方项目资格、完整接种史核对和持续更新尚未齐备；目前提供免费核对预览，不出售或扣除树芽。' } as const

const doseLabels: Record<string, string> = { dose_1: '第1剂', dose_2: '第2剂', dose_3: '第3剂', dose_4: '第4剂', booster: '加强剂', unknown: '剂次待核对' }
export interface VaccineSourceRow { id: string; eventId: string; name: string; dose: string; date: string; source: string; originals: number; unknowns: string[] }
const validDay = (value: string | undefined) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return ''
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value! : ''
}
export function vaccinationSourceRows(entries: readonly JournalEntry[]): VaccineSourceRow[] {
  return entries.filter(entry => entry.categories?.includes('vaccination')).flatMap(entry => {
    const source = entry.vaccination?.recognitionSource ? '接种凭证识别后记录' : entry.sourceType === 'doctor_confirmation' ? '已记录的医生资料' : '家长已保存的记录'
    const items = entry.vaccination?.items.filter(item => !item.profileListDeletedAt) ?? []
    if (!items.length) return [{ id: entry.id, eventId: entry.eventId, name: entry.content, dose: '剂次待核对', date: '', source, originals: entry.attachmentCount, unknowns: ['疫苗名称、剂次及接种日期需与原件核对'] }]
    return items.map(item => {
      // An explicitly unknown per-item date must never become upload/event time.
      const date = Object.prototype.hasOwnProperty.call(item, 'administeredOn') ? validDay(item.administeredOn) : entry.timePrecision === 'unknown' ? '' : validDay(entry.occurredAt.slice(0, 10))
      return { id: `${entry.id}/${item.id}`, eventId: entry.eventId, name: item.vaccineName, dose: doseLabels[item.doseSequence] ?? '剂次待核对', date, source, originals: entry.attachmentCount, unknowns: [...(!date ? ['接种日期待核对'] : []), ...(item.doseSequence === 'unknown' ? ['剂次待核对'] : []), ...(entry.vaccination?.recognitionStatus === 'draft_unverified' ? ['识别内容尚未核对'] : [])] }
    })
  }).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
}

export interface VaccineProfileRow { id: string; name: string; displayName?: string; date: string }
export function mergeVaccinationSourceRows(profileRows: readonly VaccineProfileRow[], journalRows: readonly VaccineSourceRow[]): VaccineSourceRow[] {
  const sources = new Map(journalRows.map(row => [row.id, row]))
  return profileRows.map(row => {
    const source = sources.get(row.id)
    if (source) return { ...source, name: row.name, date: validDay(row.date), unknowns: [...source.unknowns.filter(value => value !== '接种日期待核对'), ...(!validDay(row.date) ? ['接种日期待核对'] : [])] }
    return { id: row.id, eventId: '', name: row.name, dose: '剂次待核对', date: validDay(row.date), source: '孩子档案中的原记录', originals: 0, unknowns: ['剂次及原始凭证待核对', ...(!validDay(row.date) ? ['接种日期待核对'] : [])] }
  }).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
}

export function vaccineUnknowns(rows: readonly VaccineSourceRow[], legacyCount: number, region: VaccineRegion): string[] {
  return [
    ...(rows.length === 0 ? ['尚无可逐项核对的结构化接种记录；这不表示没有接种。'] : []),
    ...rows.flatMap(row => row.unknowns.map(item => `${row.name}：${item}`)),
    ...(legacyCount ? [`另有${legacyCount}条历史档案，请带原件核对，尚未自动对应剂次。`] : []),
    region === 'other' ? '该地区的官方程序尚未维护。' : '当地免费项目、居住/年龄资格与费用尚待接种单位核对。',
    '请与接种单位确认完整接种史；本页不判断漏种、禁忌或补种日期。'
  ]
}

export function vaccineChecklistText(memberName: string, region: VaccineRegion, area: string, rows: readonly VaccineSourceRow[], unknowns: readonly string[]) {
  const program = region === 'other' ? null : vaccinePrograms[region]
  return ['Hoooho 疫苗资料核对清单', `资料归属：${memberName}`, `常住地区：${program?.label ?? '其他地区'}${area.trim() ? ` · ${area.trim()}` : ''}`, '免费核对预览；不作为个体接种安排。', '', '已保存的原记录', ...(rows.length ? rows.map(row => `${row.name} · ${row.dose} · ${row.date || '接种日期待核对'}\n来源：${row.source}；${row.originals}份原件`) : ['尚无结构化记录，不表示没有接种。']), '', '带到接种单位核对', ...unknowns.map(item => `• ${item}`), '', ...(program ? [program.version, `官方来源：${program.sourceTitle}`, program.sourceUrl, `网页发布/更新：${program.publishedOn}；资料核对：${program.verifiedOn}`, '', '0—7岁官方程序参考（不是下一针安排）', ...program.rows.map(row => `${row.name}：${row.ages}${row.note ? `。${row.note}` : ''}`)] : ['当前地区程序尚未维护，请查阅当地卫生部门资料。'])].join('\n')
}

function escapeCalendar(value: string) { return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\u0000/g, '') }
function calendarStamp(date: Date) { return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z') }
function foldCalendarLine(line: string) {
  const parts: string[] = []; let current = ''; let size = 0
  for (const character of line) { const bytes = new TextEncoder().encode(character).length; if (size + bytes > 73) { parts.push(current); current = ' '; size = 1 }; current += character; size += bytes }
  parts.push(current); return parts.join('\r\n')
}
export function vaccineReviewCalendar(memberName: string, localDateTime: string, now: Date, uid: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localDateTime)) throw new Error('请手动选择核对日期和时间')
  const at = new Date(localDateTime)
  if (!Number.isFinite(at.getTime()) || at.getTime() <= now.getTime()) throw new Error('请选择未来的核对时间')
  const [day, time] = localDateTime.split('T'), [year, month, date] = day.split('-').map(Number), [hour, minute] = time.split(':').map(Number)
  if (at.getFullYear() !== year || at.getMonth() + 1 !== month || at.getDate() !== date || at.getHours() !== hour || at.getMinutes() !== minute) throw new Error('该日期或时间无效，请重新选择')
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hoooho//Vaccine Record Review//ZH', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:${escapeCalendar(uid)}@hoooho.com`, `DTSTAMP:${calendarStamp(now)}`, `DTSTART:${calendarStamp(at)}`, `DTEND:${calendarStamp(new Date(at.getTime() + 15 * 60_000))}`, `SUMMARY:${escapeCalendar(`${memberName} · 核对疫苗接种资料`)}`, `DESCRIPTION:${escapeCalendar('这是家长手动安排的资料核对待办，不是接种预约或疫苗日期。请携带针卡/原件，与接种单位核对接种史及当地政策。')}`, 'END:VEVENT', 'END:VCALENDAR'].map(foldCalendarLine).join('\r\n') + '\r\n'
}
