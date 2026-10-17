import type { VisitSheet } from '../../types/visitSheet'
export function readingCourseGroups(report: VisitSheet) { return (report.reading?.courseGroups ?? []).filter(group => group.id !== 'symptom') }
export function questionText(value: string) { return value.trim().replace(/^(?:问题\s*)?(?:[（(][一二三四五六七八九十\d]+[）)]|[一二三四五六七八九十\d]+(?:[.．](?!\d)|[、:：)）]))\s*/, '') }
export function questionOrdinal(index: number) { return `问题${['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][index] ?? index + 1}` }
