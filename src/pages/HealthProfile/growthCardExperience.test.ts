import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const home = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
const healthEvents = readFileSync(new URL('../HealthEvents/index.tsx', import.meta.url), 'utf8')
const subjectHeader = readFileSync(new URL('../../components/health/HealthRecordSubjectHeader.tsx', import.meta.url), 'utf8')
const nurseStation = readFileSync(new URL('../NurseStation/index.tsx', import.meta.url), 'utf8')
const bloodTypeEditor = readFileSync(new URL('../NurseStation/BloodTypeEditorSheet.tsx', import.meta.url), 'utf8')
const editor = readFileSync(new URL('./BasicHealthProfilePage.tsx', import.meta.url), 'utf8')
const polish = readFileSync(new URL('../../styles/product-polish.css', import.meta.url), 'utf8')

test('孩子档案复用首页对象顶栏，正文保留分组手动档案入口', () => {
  assert.match(home, /MainAppHeader childIdentity title="孩子档案"/)
  assert.doesNotMatch(home, /HealthRecordSubjectHeader/)
  assert.doesNotMatch(healthEvents, /HealthRecordSubjectHeader/)
  assert.match(healthEvents, /<MainAppHeader title="健康日历"/)
  assert.match(subjectHeader, /journal-subject-row/)
  assert.match(subjectHeader, /就诊情况单/)
  assert.match(subjectHeader, /formatAgeFromBirthday/)
  assert.match(home, /profile-list\/\$\{id\}/)
  assert.doesNotMatch(home, /查看与补充/)
  assert.doesNotMatch(home, /建议优先补充|搜索健康档案|重要健康事实/)
  assert.doesNotMatch(home, /已建立|growth-identity-card|更新成长数据|铸造成长身份卡|growth-identity-card__metrics|growth-identity-card__action|growth-identity-card__updated/)
  assert.match(home, /title: '基本资料'[\s\S]*title: '健康史'[\s\S]*title: '儿童保健'/)
  assert.match(home, /<HohoSection[\s\S]*health-profile-entries/)
  // Growth editing now remains in the profile; the approved conversation home
  // no longer duplicates its data board. The editor contracts stay below.
  assert.doesNotMatch(bloodTypeEditor, /ProfileChoiceGroup label="RhD"/)
  assert.doesNotMatch(bloodTypeEditor, /当前：/)
  assert.match(bloodTypeEditor, /blood-type-sheet__heading/)
  assert.doesNotMatch(home, /makeMemberProfileOpenState|openMember/)
})

test('成长数据合并曲线、录入和记录列表入口', () => {
  assert.match(editor, /title="成长数据"/)
  assert.match(editor, /体重曲线<\/button><\/div><button onClick=\{openRecords\} type="button">记录列表/)
  assert.doesNotMatch(editor, /growth-record-list-entry|查看历史 · 编辑 · 删除/)
  assert.match(editor, /保存本次更新/)
  assert.match(editor, /已保存，并加入成长记录/)
  assert.match(editor, /growthMeasurementService\.upsert/)
  assert.match(editor, /heightMeasureLabel\(member\.birthday, measuredAt\)/)
  assert.match(editor, /<small>kg<\/small>/)
  assert.doesNotMatch(editor, /aria-label="测量日期"|记录本次测量|WebPageHeader action=/)
  assert.doesNotMatch(editor, /growth-update-member|点击数值可手动编辑|<label>测量日期|<small>g<\/small>|血型/)
  assert.match(polish, /\.growth-data-content \{[^}]*align-content: start/)
  assert.doesNotMatch(editor, /今日成长落点|填写后自动保存|查看完整成长曲线|头围|腰围|体脂率/)
  assert.doesNotMatch(editor, /积分|签到|连续填写|超过.*用户/)
})

test('现有档案入口真实导航，目录暂停智能上传', () => {
  assert.match(home, /title: '过敏史'[\s\S]*title: '慢性病史'[\s\S]*title: '家族史'[\s\S]*title: '手术史'[\s\S]*title: '疫苗接种记录'/)
  assert.match(home, /navigate\(path\)/)
  assert.doesNotMatch(home, /ProfileUploadBatch|上传资料/)
  assert.match(home,/title: '生长记录', icon: TrendingUp/)
  assert.doesNotMatch(home, /aria-disabled="true"|LockKeyhole|暂未开放|health-profile-allergy-card|检查 \/ 体检报告|住院 \/ 急诊史|家族遗传史/)
})
