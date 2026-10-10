import { parsePlainDate } from '../../utils/localCalendarDate'

type Schedule = { rest: readonly (readonly [string, string, string])[]; work: readonly string[]; qingming: string }
// Mainland China, official State Council notices; update explicitly when a new annual notice is published.
// 2024: https://app.www.gov.cn/govdata/gov/202310/25/508678/article.html
// 2025: https://www.forestry.gov.cn/c/www/szxx/594663.jhtml
// 2026: https://www.beijing.gov.cn/zhengce/zhengcefagui/202511/t20251104_4258873.html
const schedules: Record<number, Schedule> = {
  2024: { rest: [['01-01','01-01','元旦'],['02-10','02-17','春节'],['04-04','04-06','清明'],['05-01','05-05','劳动'],['06-08','06-10','端午'],['09-15','09-17','中秋'],['10-01','10-07','国庆']], work: ['02-04','02-18','04-07','04-28','05-11','09-14','09-29','10-12'], qingming:'04-04' },
  2025: { rest: [['01-01','01-01','元旦'],['01-28','02-04','春节'],['04-04','04-06','清明'],['05-01','05-05','劳动'],['05-31','06-02','端午'],['10-01','10-08','国庆 / 中秋']], work: ['01-26','02-08','04-27','09-28','10-11'], qingming:'04-04' },
  2026: { rest: [['01-01','01-03','元旦'],['02-15','02-23','春节'],['04-04','04-06','清明'],['05-01','05-05','劳动'],['06-19','06-21','端午'],['09-25','09-27','中秋'],['10-01','10-07','国庆']], work: ['01-04','02-14','02-28','05-09','09-20','10-10'], qingming:'04-05' },
}
const lunar = new Intl.DateTimeFormat('en-u-ca-chinese', { month:'numeric', day:'numeric', timeZone:'UTC' })
function lunarFestival(date: Date) {
  const parts = lunar.formatToParts(date)
  const month = parts.find(p => p.type === 'month')?.value
  const day = parts.find(p => p.type === 'day')?.value
  // A leap month must not produce a second celebration.
  return ({ '1-1':'春节', '1-15':'元宵', '5-5':'端午', '8-15':'中秋', '9-9':'重阳', '12-8':'腊八' } as Record<string,string>)[`${month}-${day}`] ?? ''
}
export function calendarDayInfo(day: string) {
  const p = parsePlainDate(day)
  if (!p) return { weekend:false, weekday:'', festival:'', rest:false, work:false, description:'' }
  // UTC noon represents the supplied civil date; host timezone never shifts a holiday.
  const date = new Date(`${day}T12:00:00Z`), weekday = date.getUTCDay(), md = day.slice(5), schedule = schedules[p.year]
  const restName = schedule?.rest.find(([start,end]) => md >= start && md <= end)?.[2] ?? ''
  const fixed: Record<string,string> = {'01-01':'元旦','03-08':'妇女','05-01':'劳动','05-04':'青年','06-01':'儿童','08-01':'建军','10-01':'国庆'}
  let festival = fixed[md] || (md === schedule?.qingming ? '清明' : '') || lunarFestival(date)
  if (!festival && lunarFestival(new Date(date.getTime() + 86400000)) === '春节') festival = '除夕'
  const work = Boolean(schedule?.work.includes(md)), rest = Boolean(restName)
  const weekdayName = `周${['日','一','二','三','四','五','六'][weekday]}`
  return { weekend:weekday === 0 || weekday === 6, weekday:weekdayName, festival, rest, work,
    description: [weekdayName, festival, work ? '调休上班' : rest ? `${restName}假期，休息` : ''].filter(Boolean).join('，') }
}
