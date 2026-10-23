import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const styles = readFileSync(new URL('./nurseStation.css', import.meta.url), 'utf8')
const source = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
const taskSource = readFileSync(new URL('./GuardianTaskListPage.tsx', import.meta.url), 'utf8')
const taskStyles = readFileSync(new URL('./guardianTasks.css', import.meta.url), 'utf8')

// The superseded two-card home geometry is covered by the conversational
// browser acceptance; retained task/record contracts continue below.
test('任务管理迁移到两个独立二级页并常驻进行中与已归档', () => {
  assert.match(taskStyles, /\.guardian-task-page__tabs\s*\{[^}]*grid-template-columns:\s*repeat\(2,/)
  assert.match(taskSource, /role="tablist"/)
  assert.match(taskSource, /进行中/)
  assert.match(taskSource, /已归档/)
  assert.match(taskSource, /管理.*左滑卡片/)
  assert.match(taskSource, /export function MedicationReminderListPage/)
  assert.match(taskSource, /export function DesensitizationTestListPage/)
  assert.doesNotMatch(source, /guardian-tasks|guardian-task-tabs|新增提醒|新增测试/)
})

test('任务卡展示真实下次时间、可换行标题和可读详情', () => {
  const medicationCard = readFileSync(new URL('./MedicationReminderCard.tsx', import.meta.url), 'utf8')
  assert.match(medicationCard, /下次：\{archived[\s\S]*formatReminderOccurrence/)
  assert.match(medicationCard, /疗程：/)
  assert.match(medicationCard, /用法：/)
  assert.match(medicationCard, /今日计划：/)
  assert.match(medicationCard, /medication-course-card__week/)
  assert.match(medicationCard, /task-management__trigger/)
})
