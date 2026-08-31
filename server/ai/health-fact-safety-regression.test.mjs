import assert from 'node:assert/strict'
import test from 'node:test'
import { AIService } from './ai-service.mjs'
import { classifyHealthInputBeforeExtraction } from './health-input-intent.mjs'
import { resolveFactSubjects } from './health-subject-resolver.mjs'
import { TimeResolverService } from './time-resolver-service.mjs'

const referenceNow = new Date('2026-08-31T08:00:00.000Z')
const parseOptions = { referenceNow, selectedOccurredAt: '2026-08-31T15:00:00+08:00', timezone: 'Asia/Shanghai' }
const ai = new AIService({ primaryProvider: false })

function rawFact(name, sourceText) {
  return { type: 'symptom', name, sourceText, originalText: sourceText, subject: 'event_subject' }
}

test('100 条多人物组合全部被服务端主体门禁阻止', () => {
  const self = { id: 'member-self', accountId: 'account', name: '测试成人', relationship: 'self', isSelf: true }
  const child = { id: 'member-child', accountId: 'account', name: '测试宝宝', relationship: 'child', isSelf: false }
  const childInputs = ['宝宝发烧', '孩子咳嗽', '女儿头痛', '儿子腹痛', '测试宝宝呕吐', '宝宝皮疹', '孩子头晕', '女儿鼻塞', '儿子咽痛', '宝宝腹泻']
  const selfInputs = ['我头痛', '我自己咳嗽', '本人发烧', '我腹痛', '我自己呕吐', '本人头晕', '我皮疹', '我自己鼻塞', '本人咽痛', '我腹泻']
  let checked = 0
  for (const childInput of childInputs) {
    for (const selfInput of selfInputs) {
      assert.throws(
        () => resolveFactSubjects(`${childInput}，${selfInput}`, [rawFact('儿童症状', childInput), rawFact('成人症状', selfInput)], child, [self, child]),
        (error) => error.code === 'MULTIPLE_SUBJECTS_NEED_SPLIT'
      )
      checked += 1
    }
  }
  assert.equal(checked, 100)
})

test('50 条否定与纠正样本不产生相反阳性事实并保留纠正结果', async () => {
  const symptoms = [
    ['发热', '发烧'], ['咳嗽', '咳嗽'], ['头痛', '头痛'], ['腹痛', '腹痛'], ['皮疹', '皮疹'], ['呕吐', '呕吐']
  ]
  const negators = ['没有', '没', '未见', '不再', '不是']
  let checked = 0
  for (const [name, word] of symptoms) {
    for (const negator of negators) {
      const output = await ai.organizeHealthRecord(`${negator}${word}`, parseOptions)
      assert.equal(output.healthAIOutput.facts.some((fact) => fact.name === name && fact.polarity === 'affirmed'), false, `${negator}${word}`)
      checked += 1
    }
  }
  for (let index = 0; index < 10; index += 1) {
    const output = await ai.organizeHealthRecord(`刚才说左腿痛不对，实际是右腿痛${'。'.repeat(index % 2)}`, parseOptions)
    assert.ok(output.healthAIOutput.facts.some((fact) => fact.bodyPart === '右腿' && fact.polarity === 'affirmed'))
    assert.equal(output.healthAIOutput.facts.some((fact) => fact.bodyPart === '左腿' && fact.polarity === 'affirmed'), false)
    checked += 1
  }
  for (let index = 0; index < 10; index += 1) {
    const expected = 38 + index / 10
    const output = await ai.organizeHealthRecord(`体温39.2度不对，实际是${expected.toFixed(1)}度`, parseOptions)
    const temperatures = output.healthAIOutput.facts.filter((fact) => fact.type === 'temperature' && fact.polarity === 'affirmed')
    assert.deepEqual(temperatures.map((fact) => fact.temperature.max), [expected])
    checked += 1
  }
  assert.equal(checked, 50)
})

test('30 条明确时间表达在 Asia/Shanghai 固定时钟下可解析且不回退提交时间', () => {
  const resolver = new TimeResolverService()
  const timeReference = new Date('2026-08-31T15:59:00.000Z')
  const expressions = [
    ...['昨晚23:00', '昨晚23:30', '今天凌晨1点', '今天早上8点', '今天上午10点', '今天中午12点', '今天下午3点', '今天晚上8点', '昨天22:15', '前天06:30'],
    ...Array.from({ length: 10 }, (_, index) => `8月${20 + index}日`),
    ...['昨晚', '昨天晚上', '今天凌晨', '今天早上', '今天上午', '今天中午', '今天下午', '今天晚上', '前天', '昨天']
  ]
  assert.equal(expressions.length, 30)
  for (const expression of expressions) {
    const result = resolver.resolve(expression, { referenceNow: timeReference, timezone: 'Asia/Shanghai' })
    assert.ok(result.resolvedStart, expression)
    assert.notEqual(result.source, 'selected_time', expression)
    assert.ok(new Date(result.resolvedStart).getTime() <= timeReference.getTime(), expression)
  }
})

test('30 条多事实输入均保留症状、体温和用药三个原子事实', async () => {
  const symptoms = ['咳嗽', '头痛', '腹痛', '皮疹', '呕吐']
  const temperatures = [37.5, 37.8, 38.1, 38.5, 38.8, 39.1]
  let checked = 0
  for (const symptom of symptoms) {
    for (const temperature of temperatures) {
      const output = await ai.organizeHealthRecord(`${symptom}，体温${temperature}度，已经吃了布洛芬。`, parseOptions)
      assert.ok(output.healthAIOutput.facts.some((fact) => fact.type === 'symptom' && fact.polarity === 'affirmed'))
      assert.ok(output.healthAIOutput.facts.some((fact) => fact.type === 'temperature' && fact.temperature?.max === temperature))
      assert.ok(output.healthAIOutput.facts.some((fact) => fact.type === 'medication' && fact.medicationAction === 'taken'))
      checked += 1
    }
  }
  assert.equal(checked, 30)
})

test('条件、知识问句、担忧、引用和转述在提取前 fail-closed', () => {
  for (const input of [
    '要是明天发烧就麻烦了。', '如果以后又发烧怎么办？', '发烧一般应该怎么办？', '发烧需要马上去医院吗？',
    '我担心他明天会发烧。', '网上说发烧可能是肺炎。', '医生问妈妈有没有头痛。', '电视里说孩子发烧了。'
  ]) assert.equal(classifyHealthInputBeforeExtraction(input), 'irrelevant_or_chat', input)
})
