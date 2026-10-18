import test from 'node:test';
import assert from 'node:assert/strict';
import { observationRange, reviewText } from './model';
import type { ObservationReview } from './api';
test('card range uses explicit month/day wording and includes both years when crossing years', () => {
  assert.equal(observationRange('2026-10-14T09:00:00+08:00', '2026-10-21T09:00:00+08:00'), '10月14日至10月21日');
  assert.equal(observationRange('2026-12-30T09:00:00+08:00', '2027-01-06T09:00:00+08:00'), '2026年12月30日至2027年1月6日');
  assert.equal(observationRange(null, null), '待首次食用记录');
});
test('export distinguishes saved evidence, parent recollection and unknown symptoms without a medical success claim', () => {
  const review: ObservationReview = { id: 'review-1', round: 1, days: 7, reviewedAt: '2026-10-21T01:00:00Z', startAt: '2026-10-14T01:00:00Z', dueAt: '2026-10-21T01:00:00Z', sources: [], symptoms: [], intake: 'unknown', intakeLabel: '记不清是否继续吃', symptomsAnswer: 'unknown', symptomsLabel: '不确定是否新增或加重', note: '', outcome: '信息不足，保留观察', sourceChanged: true };
  const text = reviewText('南瓜', '小禾', review);
  assert.match(text, /家长回访：记不清/); assert.match(text, /无相关已保存记录；不代表没有症状/); assert.match(text, /原始记录有变化/); assert.match(text, /不作为医学排除或耐受结论/); assert.doesNotMatch(text, /排敏成功|已耐受|已排除过敏/);
});
