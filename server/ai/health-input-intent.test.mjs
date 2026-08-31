import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyExtractedHealthInput, classifyHealthInputBeforeExtraction, eligibleHealthFacts } from './health-input-intent.mjs'

const fact = (overrides = {}) => ({
  type: 'symptom', name: '头痛', subject: 'event_subject', source: 'user_report',
  temporality: 'current', status: 'active', polarity: 'affirmed', confidence: 0.95,
  ...overrides
})

test('产品操作、纠正、删除和测试语句在健康事实提取前被拦截', () => {
  for (const input of [
    '把来源改成语音记录。', '不是用户记录，是语音记录。', '这条不要记录。', '把刚才那条删掉。',
    '把发热改成头痛。', '这个标签颜色不对。', '帮我修改一下类型。'
  ]) assert.equal(classifyHealthInputBeforeExtraction(input), 'correction_or_command', input)

  for (const input of ['你听到了吗？', '我随便测试一下。']) {
    assert.equal(classifyHealthInputBeforeExtraction(input), 'irrelevant_or_chat', input)
  }
})

test('真实健康陈述不会因出现常用词而被产品指令规则误拦截', () => {
  for (const input of [
    '孩子刚才体温38度。', '今天咳嗽比昨天轻了一些。', '右眼周围还是痒。',
    '晚上十点吃了5毫升布洛芬。', '现在不发烧了，但是还有头痛。'
  ]) assert.equal(classifyHealthInputBeforeExtraction(input), null, input)
})

test('只有当前记录对象的真实健康事实可以进入保存候选', () => {
  const output = { facts: [
    fact(),
    fact({ name: '引用的头痛', source: 'quoted_text' }),
    fact({ name: '他人头痛', subject: 'other_person' }),
    fact({ name: '计划服药', temporality: 'future' }),
    fact({ name: '无呕吐', polarity: 'negated', status: 'not_applicable' })
  ] }
  assert.deepEqual(eligibleHealthFacts(output).map(({ name }) => name), ['头痛', '无呕吐'])
  assert.equal(classifyExtractedHealthInput('我现在头痛', output), 'health_fact')
  assert.equal(classifyExtractedHealthInput('好像有点不舒服', { facts: [fact({ polarity: 'uncertain', confidence: 0.5 })] }), 'uncertain_health_fact')
  assert.equal(classifyExtractedHealthInput('今天天气不错', { facts: [] }), 'irrelevant_or_chat')
})
