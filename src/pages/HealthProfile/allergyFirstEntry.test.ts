import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('./AllergyProfilePage.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../../styles/product-polish.css', import.meta.url), 'utf8')
const journalLink = readFileSync(new URL('../HealthEventDetail/components/AllergyLinkSheet.tsx', import.meta.url), 'utf8')

test('过敏史二级页使用紧凑头部、报告入口和两组共享容器', () => {
  assert.match(page, /title="过敏史"/)
  assert.match(page, /检查报告/)
  assert.match(page, /label="已明确"/)
  assert.match(page, /label="待排查"/)
  assert.match(page, /className="allergy-history-row"/)
  assert.doesNotMatch(page, /<Identity/)
})

test('添加在当前页使用单层底部弹窗，六类含动物且没有搜索向导', () => {
  assert.match(page, /<BottomSheetSurface className="allergy-quick-sheet"/)
  assert.match(page, /label="过敏对象"/)
  for (const category of ['food', 'drug', 'animal', 'environment', 'contact', 'unknown']) assert.match(page, new RegExp(`id:'${category}'`))
  assert.doesNotMatch(page, /id:'insect'/)
  assert.doesNotMatch(page, /搜索过敏原/)
  assert.doesNotMatch(page, /下一步/)
})

test('报告为模块级上传并明确无 OCR 时采用人工多项核对', () => {
  assert.match(page, /当前没有可用的自动识别能力/)
  assert.match(page, /添加报告项目/)
  assert.match(page, /阳性只作为待排查线索，阴性不会删除已有过敏史/)
  assert.match(page, /查看原件/)
})

test('对象详情不再创建第四级记录查看页', () => {
  assert.match(page, /allergy-inline-record/)
  assert.doesNotMatch(page, /reactions\/\$\{record\.id\}/)
  assert.doesNotMatch(page, /tests\/\$\{record\.id\}/)
})

test('健康随记明确关联只建立待排查线索并保留记录 ID', () => {
  assert.match(journalLink, /linkJournalObservation/)
  assert.match(journalLink, /不会自动写成已明确过敏/)
  assert.match(journalLink, /recordId/)
  assert.match(journalLink, /尚未明确/)
})

test('iPhone SE 规则保持 44px 点击区、紧凑间距和安全区', () => {
  assert.match(styles, /@media\(max-height:667px\) and \(max-width:430px\)/)
  assert.match(styles, /allergy-category-options button[^}]*min-height:48px/)
  assert.match(styles, /allergy-history-content[^}]*safe-area-inset-bottom/)
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/)
})
