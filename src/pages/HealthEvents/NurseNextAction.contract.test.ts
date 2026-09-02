import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const source = read('./NurseNextAction.tsx')
const styles = read('./NurseNextAction.css')
const longImage = read('./consultationSummaryLongImage.ts')

test('Logo 下一步只在浮窗内提供三个冻结场景', () => {
  assert.match(source, /title=\{title\}/)
  assert.match(source, /\['ai', '去问 AI'\]/)
  assert.match(source, /\['hospital', '去医院'\]/)
  assert.match(source, /\['help', '去求助'\]/)
  assert.match(source, /categoryContent\[category\]/)
  for (const id of ['registration', 'medical-summary', 'doctor-questions', 'medical-list', 'help-summary', 'help-poster', 'key-information', 'share-contact']) assert.match(source, new RegExp(`id: '${id}'`))
})

test('去问 AI 只选择五项资料并一次生成统一问诊摘要', () => {
  for (const label of ['基本信息', '当前健康随记', '健康档案', '原始记录', '相关历史随记']) assert.match(read('./consultationSummary.ts'), new RegExp(label))
  assert.match(source, /选择要生成的信息/)
  assert.match(source, /已选择 \{selected.length\} 项/)
  assert.match(source, /'生成问诊摘要'/)
  assert.doesNotMatch(source, /textarea|input|快捷问题|生成完整提问|生成完整提示词/)
  assert.doesNotMatch(source, /生成长图摘要|生成提示词摘要/)
})

test('生成后两种等权导出复用同一个 summary', () => {
  assert.match(source, /title="保存为长图"/)
  assert.match(source, /title="复制为提示词"/)
  assert.match(source, /<LongImagePreview summary=\{summary\}/)
  assert.match(source, /<PromptPreview summary=\{summary\}/)
  assert.match(source, /copyPromptText\(summary.prompt\)/)
  assert.match(source, /await import\('\.\/consultationSummaryLongImage'\)/)
  assert.match(source, /saveConsultationSummaryLongImage\(summary\)/)
  assert.match(source, /setFeedback\(result.ok \? '已复制'/)
  assert.match(styles, /nurse-summary-export__list \.hoho-surface-row \{ min-height: 52px/)
})

test('长图是按需生成的独立品牌信息图且保存反馈不虚报相册写入', () => {
  assert.match(longImage, /canvas\.toBlob/)
  assert.match(longImage, /Hoooho/)
  assert.match(longImage, /问诊摘要/)
  assert.match(longImage, /信息由本人记录，仅供沟通参考/)
  assert.match(longImage, /MicroMessenger/)
  assert.doesNotMatch(longImage, /html2canvas|querySelector\(['"]\.hoho-bottom-sheet/)
  assert.match(source, /长图已下载，请在下载中保存到相册/)
  assert.match(source, /长图已打开，请长按图片保存/)
})

test('iPhone SE 使用固定底部操作区、紧凑单行资料和项目设计令牌', () => {
  assert.match(source, /footer=\{footer\}/)
  assert.match(styles, /nurse-summary-option[\s\S]*min-height: 50px/)
  assert.match(styles, /white-space: nowrap/)
  assert.match(styles, /@media \(max-height: 700px\)/)
  assert.match(styles, /var\(--hoho-color-primary\)/)
  assert.doesNotMatch(styles, /linear-gradient|#[0-9a-fA-F]{3,8}/)
})
