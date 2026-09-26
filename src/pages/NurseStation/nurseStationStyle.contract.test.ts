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
  assert.match(styles, /\.nurse-station-guarded\s*\{[^}]*margin-top:\s*8px/)
  assert.match(styles, /\.nurse-station-fact\s*\{[^}]*height:\s*36px[^}]*margin-top:\s*4px[^}]*overflow:\s*hidden/)
  assert.match(styles, /\.nurse-station-fact\s*>\s*span\s*\{[^}]*white-space:\s*nowrap/)
  assert.match(styles, /\.nurse-station-visual\s*\{[^}]*height:\s*114px[^}]*background:\s*#fff/)
  assert.doesNotMatch(styles, /\.nurse-station-visual\s*\{[^}]*(?:gradient|mask-image)/)
  assert.doesNotMatch(source, /今天想让我们帮你做什么|容易忘、需要持续观察/)
})

test('首页四入口使用紧凑双列卡片和独立图文层', () => {
  assert.match(styles, /\.nurse-home-entries\s*\{[^}]*grid-template-columns:\s*repeat\(2,[^}]*gap:\s*10px/)
  assert.match(styles, /\.nurse-home-entry\s*\{[^}]*height:\s*88px[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*58px/)
  assert.match(styles, /\.nurse-home-entry__copy strong\s*\{[^}]*font-size:\s*14px[^}]*font-weight:\s*500/)
  assert.match(styles, /\.nurse-home-entry__copy small\s*\{[^}]*font-size:\s*11px[^}]*line-height:\s*16px/)
  assert.match(styles, /\.nurse-home-entry__visual img\s*\{[^}]*object-fit:\s*contain/)
  assert.match(source, /健康随记.*记录日常与身体变化.*healthDiaryImage.*\/health-events/)
  assert.match(source, /健康档案.*整理家人的健康信息.*healthProfileImage.*\/health-profile/)
  assert.match(source, /就诊情况单.*就诊前，一页理清病情.*visitSummaryImage.*\/visit-summary/)
  assert.match(source, /忌口出示卡.*哪些不能吃，出示就懂.*dietaryCardImage/)
  assert.match(source, /<Link aria-label=\{entry\.title\}/)
  assert.match(source, /<img alt=""[^>]*onError=/)
  assert.doesNotMatch(source, /健康事件记录|更多服务|过敏出示|能不能吃|附近就医/)
  assert.doesNotMatch(source, /nurse-primary-entries|nurse-more-services/)
})

test('守护任务使用标题下拉和两个等宽类别切换', () => {
  assert.match(styles, /\.guardian-task-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(2,/)
  assert.match(source, /role="tablist"/)
  assert.match(source, /'新增测试':'新增提醒'/)
  assert.doesNotMatch(source, /guardian-task-add/)
  assert.match(source, /guardian-task-heading/)
  assert.doesNotMatch(source, /<strong>\{member\.name\}<\/strong>的任务/)
  assert.match(source, /还没有排敏测试/)
  assert.doesNotMatch(source, /疫苗提醒|guardian-notification-notice|用药计划仍会保留/)
  assert.doesNotMatch(source, /本轮暂不新增业务流程|页签已保留，现有记录不会改变/)
  assert.doesNotMatch(source, /共 \{active\.length\}/)
})

test('任务卡展示真实下次时间、可换行标题和可读详情', () => {
  assert.match(source, /下次：\$\{formatOccurrence/)
  assert.match(source, /guardian-plan-details/)
  assert.match(styles, /\.guardian-task-copy strong\s*\{[^}]*font-size:\s*16px[^}]*overflow-wrap:\s*anywhere/)
  assert.match(styles, /\.guardian-task-copy small\s*\{[^}]*font-size:\s*14px[^}]*overflow-wrap:\s*anywhere/)
  assert.doesNotMatch(styles, /\.guardian-task-copy small\s*\{[^}]*text-overflow:\s*ellipsis/)
})
