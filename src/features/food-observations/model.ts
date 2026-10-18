import type { ObservationReview } from './api';
export function observationRange(start: string | null, end: string | null) {
  if (!start || !end) return '待首次食用记录';
  const a = new Date(start), b = new Date(end), crossYear = a.getFullYear() !== b.getFullYear();
  const format = (date: Date) => `${crossYear ? `${date.getFullYear()}年` : ''}${date.getMonth() + 1}月${date.getDate()}日`;
  return `${format(a)}至${format(b)}`;
}
export function reviewText(name: string, child: string, review: ObservationReview) {
  return `${child} · ${name} · 第${review.round}轮观察\n${observationRange(review.startAt, review.dueAt)}（${review.days}天）\n\n正式食用记录：${review.sources.length}条\n${review.sources.map(s => `${new Date(s.occurredAt).toLocaleString('zh-CN', { hour12: false })} ${s.content}`).join('\n') || '无可核对的食用记录'}\n\n家长回访：${review.intakeLabel}；${review.symptomsLabel}\n${review.note ? `补充：${review.note}\n` : ''}\n同期间症状记录：${review.symptoms.length}条\n${review.symptoms.map(s => `${new Date(s.occurredAt).toLocaleString('zh-CN', { hour12: false })} ${s.content}`).join('\n') || '无相关已保存记录；不代表没有症状'}\n\n汇总：${review.outcome}\n${review.sourceChanged ? '汇总后原始记录有变化，请结合最新记录核对。\n' : ''}此汇总只整理已记录与家长回访的信息，不判断食物与症状的因果关系，不作为医学排除或耐受结论。`;
}
