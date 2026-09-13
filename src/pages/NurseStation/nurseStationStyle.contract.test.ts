import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const styles = readFileSync(new URL('./nurseStation.css', import.meta.url), 'utf8')
const source = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')

test('顶部将人物信息、守护天数、轮播事实和真实视频收纳为单一品牌区域', () => {
  assert.match(source, /className="nurse-station-hero"/)
  assert.match(source, /<NurseStationFactTypewriter \/>/)
  assert.match(source, /<NurseTriageDesk/)
  assert.match(styles, /\.nurse-station-hero\s*\{[^}]*height:\s*136px[^}]*border:\s*1px solid #dcedea[^}]*border-radius:\s*19px[^}]*background:\s*#fff/)
  assert.match(styles, /\.nurse-station-fact\s*\{[^}]*height:\s*36px[^}]*margin-top:\s*10px[^}]*overflow:\s*hidden/)
  assert.match(styles, /\.nurse-station-fact\s*>\s*span\s*\{[^}]*white-space:\s*nowrap/)
  assert.match(styles, /\.nurse-station-visual\s*\{[^}]*height:\s*114px[^}]*background:\s*#fff/)
  assert.doesNotMatch(styles, /\.nurse-station-visual\s*\{[^}]*(?:gradient|mask-image)/)
  assert.doesNotMatch(source, /今天想让我们帮你做什么|容易忘、需要持续观察/)
})

test('核心记录入口为等宽双列，更多服务为可扩展四列宫格', () => {
  assert.match(styles, /\.nurse-primary-entries\s*\{[^}]*grid-template-columns:\s*repeat\(2,/)
  assert.match(styles, /\.nurse-more-services > div\s*\{[^}]*grid-template-columns:\s*repeat\(4,/)
  assert.match(source, /健康随记/)
  assert.match(source, /健康档案/)
  assert.match(source, /健康事件记一下.*日常喂养记一下.*病症用药记一下/)
  assert.match(source, /补充基础信息.*补充过敏史.*补充家族史/)
  assert.match(styles, /\.nurse-primary-entry-title svg\s*\{[^}]*width:\s*19px[^}]*stroke-width:\s*1\.7/)
  assert.match(source, /<MedicalPrepButton[^>]*disabled=\{!hasHealthData\}[^>]*onClick=\{onMedicalPrep\}/)
  assert.match(source, /nurse-more-service--unavailable[^>]*onClick=\{\(\) => setNoticeKey/)
  assert.match(source, /功能即将开放/)
  assert.match(styles, /\.nurse-more-service--unavailable/)
  assert.doesNotMatch(source, /说明与帮助/)
})

test('守护任务使用标题下拉和三个等宽类别切换', () => {
  assert.match(styles, /\.guardian-task-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(3,/)
  assert.match(source, /role="tablist"/)
  assert.match(source, /新增用药提醒/)
  assert.doesNotMatch(source, /共 \{active\.length\}/)
})
