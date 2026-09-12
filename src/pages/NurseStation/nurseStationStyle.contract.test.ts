import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const styles = readFileSync(new URL('./nurseStation.css', import.meta.url), 'utf8')
const source = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')

test('顶部将人物信息、守护天数、轮播事实和真实视频收纳为单一品牌区域', () => {
  assert.match(source, /className="nurse-station-hero"/)
  assert.match(source, /<NurseStationFactTypewriter \/>/)
  assert.match(source, /<NurseTriageDesk/)
  assert.match(styles, /\.nurse-station-hero\s*\{[^}]*height:\s*144px[^}]*background:\s*#fff/)
  assert.match(styles, /\.nurse-station-fact\s*\{[^}]*width:\s*45%[^}]*max-height:\s*36px[^}]*overflow:\s*hidden/)
  assert.match(styles, /\.nurse-station-visual\s*\{[^}]*width:\s*55%[^}]*height:\s*144px[^}]*mask-image:/)
  assert.doesNotMatch(source, /今天想让我们帮你做什么|容易忘、需要持续观察/)
})

test('核心记录入口为等宽双列，更多服务为可扩展四列宫格', () => {
  assert.match(styles, /\.nurse-primary-entries\s*\{[^}]*grid-template-columns:\s*repeat\(2,/)
  assert.match(styles, /\.nurse-more-services > div\s*\{[^}]*grid-template-columns:\s*repeat\(4,/)
  assert.match(source, /健康随记/)
  assert.match(source, /健康档案/)
  assert.match(source, /\{hasJournal && <MedicalPrepButton className="journal-subject-summary"/)
  assert.doesNotMatch(source, /说明与帮助/)
})

test('守护任务使用标题下拉和三个等宽类别切换', () => {
  assert.match(styles, /\.guardian-task-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(3,/)
  assert.match(source, /role="tablist"/)
  assert.match(source, /新增用药提醒/)
  assert.doesNotMatch(source, /共 \{active\.length\}/)
})
