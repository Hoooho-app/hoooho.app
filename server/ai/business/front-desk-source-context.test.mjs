import assert from 'node:assert/strict'
import test from 'node:test'
import { buildFrontDeskFactSources } from './front-desk-source-context.mjs'

const current = { kind: 'current', memberId: 'member-1', label: '孩子', confirmed: true }
const message = (id, value, extra = {}) => ({ id, contextId: 'context-1', kind: 'text', status: 'completed', text: value, ...extra })
const fact = (id, value, messageId, extra = {}) => ({ id, contextId: 'context-1', status: 'active', text: value, polarity: 'affirmed', subject: current, sources: [{ messageId, attachmentId: null, quote: value }], ...extra })
function corrected(oldText, correctionText, { old = {}, next = {}, messages = [] } = {}) {
  return { facts: [fact('old', oldText, 'before', { status: 'superseded', supersededBy: 'change-2', ...old }), fact('new', correctionText, 'after', { replaces: 'old', changeId: 'change-2', ...next })], messages: [message('before', oldText), message('after', correctionText), ...messages] }
}
const retained = sources => sources.filter(source => source.retainedFromFactId)
test('verified voice attachment citations retain the actual transcript and original audio reference',()=>{
 const input={facts:[fact('voice-fact','没有呕吐','voice',{sources:[{messageId:'voice',attachmentId:'audio-1',quote:'没有呕吐'}]})],messages:[message('voice','喝了牛奶，没有呕吐。',{kind:'voice',transcriptVerified:true,voices:[{id:'audio-1',mimeType:'audio/wav'}]})]}
 const result=buildFrontDeskFactSources(input)
 assert.equal(result.length,1)
 assert.equal(result[0].text,'没有呕吐')
 assert.equal(result[0].originalReferences[0].attachmentId,'audio-1')
 for(const changed of [{transcriptVerified:false},{voices:[{id:'different',mimeType:'audio/wav'}]},{kind:'text'},{text:'喝了牛奶。'}])assert.equal(buildFrontDeskFactSources({...input,messages:[{...input.messages[0],...changed}]}).length,0)
 const image={...input.messages[0],kind:'image',voices:[],files:[{id:'audio-1',mimeType:'image/png'}]}
 assert.equal(buildFrontDeskFactSources({...input,messages:[image]}).length,0)
})
function assertTrueReferences(sources, messages) {
  for (const source of sources) for (const reference of source.originalReferences) {
    const original = messages.find(message => message.id === reference.messageId)
    assert.ok(original && original.kind !== 'assistant')
    assert.ok(original.text.includes(reference.quote), JSON.stringify(reference))
    assert.ok(source.text.includes(reference.quote) || reference.quote.includes(source.text))
  }
}

test('an active fact expands only to its exact original evidence clause with stable provenance and change type', () => {
  const input = { facts: [fact('one', '咳嗽', 'm1')], messages: [message('m1', '孩子今天开始咳嗽，昨天没有呕吐。')] }
  const snapshot = structuredClone(input), result = buildFrontDeskFactSources(input)
  assert.equal(result.length, 1)
  assert.equal(result[0].text, '孩子今天开始咳嗽')
  assert.deepEqual({ id: result[0].id, page: result[0].page, factId: result[0].factId, changeType: result[0].changeType, subject: result[0].subject, polarity: result[0].polarity }, { id: 'one', page: 1, factId: 'one', changeType: 'add', subject: current, polarity: 'affirmed' })
  assertTrueReferences(result, input.messages)
  result[0].subject.label = 'local mutation'
  assert.deepEqual(input, snapshot)
})

test('captured C05 literal label correction marks the withdrawn label separately from the new observation',()=>{
 const input=corrected('孩子今天咳嗽','不是咳嗽，是打喷嚏')
 const sources=buildFrontDeskFactSources(input),source=sources.find(source=>source.id==='new')
 assert.equal(source.text,'不是咳嗽，是打喷嚏')
 assert.deepEqual(source.literalCorrection,{version:'literal-replacement-v1',targetFactId:'old',oldValue:'咳嗽',newValue:'打喷嚏',quote:'不是咳嗽，是打喷嚏',messageId:'after'})
 assert.deepEqual(source.originalReferences,input.facts[1].sources)
 assert.deepEqual(retained(sources).map(source=>source.text),['孩子今天'])
 assertTrueReferences(sources,input.messages)
 for(const mutate of [input=>{input.facts[0].status='retracted'},input=>{input.facts[0].text='孩子今天打嗝'},input=>{input.facts[0].contextId='foreign-context'},input=>{input.facts[1].replaces='missing'}]){
  const changed=structuredClone(input);mutate(changed)
  assert.equal(buildFrontDeskFactSources(changed)[0].literalCorrection,undefined)
 }
})

test('new-value then withdrawn-value correction keeps the original onset and only quotes actual messages',()=>{
 const input=corrected('昨晚跑的时候碰到右脚小趾','刚才说错了，是左脚小趾，不是右脚。')
 const sources=buildFrontDeskFactSources(input),source=sources.find(s=>s.id==='new')
 assert.equal(source.literalCorrection.oldValue,'右脚');assert.equal(source.literalCorrection.newValue,'左脚小趾')
 assert.ok(retained(sources).some(s=>s.text==='昨晚跑的时候碰到'))
 assertTrueReferences(sources,input.messages)
})

test('a literal onset correction retains cough as a separate exact fragment and drops the standalone identity prefix', () => {
  const input = corrected('孩子今天开始咳嗽', '不是今天，是昨晚'), result = buildFrontDeskFactSources(input)
  assert.equal(result[0].id, 'new')
  assert.equal(result[0].text, '不是今天，是昨晚')
  assert.equal(result[0].changeType, 'correct')
  assert.deepEqual(retained(result).map(source => source.text), ['开始咳嗽'])
  assert.equal(retained(result)[0].retainedFromFactId, 'old')
  assert.equal(retained(result)[0].amendedBy, 'new')
  assert.equal(retained(result)[0].factId, 'old')
  assert.equal(retained(result)[0].changeType, 'add')
  assert.ok(!result.some(source => source.text === '孩子昨晚开始咳嗽'))
  assertTrueReferences(result, input.messages)
  assert.deepEqual(buildFrontDeskFactSources(input), result)
})

test('location, calendar date, dose, measurement and unknown replacements retain only other literal attributes', async t => {
  for (const [name, oldText, correction, expected] of [
    ['body location', '孩子左小腿有红点', '不是左小腿，是右小腿', ['有红点']],
    ['calendar date', '孩子2026年10月20日开始咳嗽', '不是2026年10月20日，是2026年10月19日', ['开始咳嗽']],
    ['dose value', '孩子昨晚服用维生素D 400IU', '不是400，是800', ['孩子昨晚服用维生素D', 'IU']],
    ['measurement value', '孩子今天体温38℃', '不是38，是39', ['孩子今天体温', '℃']],
    ['unknown dose', '孩子昨晚服用维生素D 400IU', '不是400，是不知道', ['孩子昨晚服用维生素D', 'IU']],
    ['unknown symptom context', '孩子今天咳嗽，肿没肿没注意', '不是今天，是昨晚', ['咳嗽，肿没肿没注意']]
  ]) await t.test(name, () => {
    const input = corrected(oldText, correction, { next: name.startsWith('unknown') ? { polarity: 'unknown' } : {} }), result = buildFrontDeskFactSources(input)
    assert.deepEqual(retained(result).map(source => source.text), expected)
    assertTrueReferences(result, input.messages)
    if (name === 'unknown dose') {
      assert.equal(result[0].polarity, 'unknown')
      assert.ok(!retained(result).some(source => source.text.includes('400')))
    }
    if (name === 'unknown symptom context') assert.ok(retained(result)[0].text.includes('没注意'))
  })
})

test('a short new literal value can bind the complete real correction without fabricating a combined sentence', () => {
  const input = corrected('孩子今天开始咳嗽', '不是今天，是昨晚')
  input.facts[1].text = '昨晚'
  const result = buildFrontDeskFactSources(input)
  assert.equal(result[0].text, '不是今天，是昨晚')
  assert.deepEqual(retained(result).map(source => source.text), ['开始咳嗽'])
  assertTrueReferences(result, input.messages)
})

test('an old fact with a narrower quote retains real same-clause time rather than other sentences', () => {
  const input = corrected('咳嗽', '不是咳嗽，是喷嚏')
  input.messages[0].text = '孩子今天开始咳嗽。爸爸昨天发热。'
  const result = buildFrontDeskFactSources(input)
  assert.deepEqual(retained(result).map(source => source.text), ['孩子今天开始'])
  assert.ok(!retained(result).some(source => source.text.includes('爸爸')))
  assertTrueReferences(result, input.messages)
})

test('old subject is immutable when a correction names another person', () => {
  const father = { kind: 'other', memberId: null, label: '爸爸', confirmed: false }
  const input = corrected('爸爸今天开始咳嗽', '不是今天，是昨晚', { old: { subject: father }, next: { subject: current } })
  const result = buildFrontDeskFactSources(input)
  assert.deepEqual(retained(result)[0].subject, father)
  assert.deepEqual(result[0].subject, current)
  assertTrueReferences(result, input.messages)
})

test('retracted, saved, unrelated, ambiguous and nonliteral targets are never revived', async t => {
  for (const [name, configure] of [
    ['retracted', input => { input.facts[0].status = 'retracted' }],
    ['withdrawal marker', input => { input.facts[0].retractedBy = 'withdraw' }],
    ['saved', input => { input.facts[0].saved = true }],
    ['formal record', input => { input.facts[0].recordId = 'record-1' }],
    ['different context', input => { input.facts[0].contextId = 'another-context' }],
    ['wrong superseding change', input => { input.facts[0].supersededBy = 'another-change' }],
    ['nonliteral replacement', input => { input.facts[1].text = '昨晚'; input.facts[1].sources[0].quote = '昨晚'; input.messages[1].text = '昨晚' }],
    ['old value absent', input => { input.facts[0].text = '孩子昨天开始咳嗽'; input.facts[0].sources[0].quote = input.facts[0].text; input.messages[0].text = input.facts[0].text }],
    ['old value repeated', input => { input.facts[0].text = '孩子今天咳嗽，今天开始'; input.facts[0].sources[0].quote = input.facts[0].text; input.messages[0].text = input.facts[0].text }],
    ['two active replacements', input => { input.facts.push({ ...structuredClone(input.facts[1]), id: 'second-new' }) }]
  ]) await t.test(name, () => {
    const input = corrected('孩子今天开始咳嗽', '不是今天，是昨晚'); configure(input)
    assert.deepEqual(retained(buildFrontDeskFactSources(input)), [])
  })
  assert.deepEqual(buildFrontDeskFactSources({ facts: [fact('withdrawn', '今天咳嗽', 'm', { status: 'retracted' })], messages: [message('m', '今天咳嗽')] }), [])
})

test('whole-fact replacement and standalone identity or age fragments create no retained fact source', () => {
  const whole = corrected('咳嗽', '不是咳嗽，是喷嚏')
  assert.deepEqual(retained(buildFrontDeskFactSources(whole)), [])
  const identity = corrected('2岁孩子今天咳嗽', '不是今天，是昨晚')
  assert.deepEqual(retained(buildFrontDeskFactSources(identity)).map(source => source.text), ['咳嗽'])
  const name = corrected('咳嗽宝宝今天喉咙痛', '不是今天，是昨晚', { old: { subject: { ...current, label: '咳嗽宝宝' } } })
  assert.deepEqual(retained(buildFrontDeskFactSources(name)).map(source => source.text), ['喉咙痛'])
  const previousCorrection = corrected('不是今天咳嗽，是昨晚咳嗽', '不是昨晚咳嗽，是前晚咳嗽')
  assert.deepEqual(retained(buildFrontDeskFactSources(previousCorrection)), [])
})

test('only active factual exact user citations are eligible; missing, assistant, failed, fabricated and repeated quotes are excluded', () => {
  const messages = [message('good', '孩子今天咳嗽'), message('assistant', '孩子今天咳嗽', { kind: 'assistant' }), message('failed', '孩子今天咳嗽', { status: 'failed', acceptedInput: true }), message('repeat', '昨天咳嗽。今天咳嗽。')]
  const facts = [fact('good', '咳嗽', 'good'), fact('context', '咳嗽', 'good', { scope: 'context' }), ...['planned', 'quoted', 'concern'].map(polarity => fact(polarity, '咳嗽', 'good', { polarity })), fact('old', '咳嗽', 'good', { status: 'superseded' }), fact('assistant', '咳嗽', 'assistant'), fact('failed', '咳嗽', 'failed'), fact('missing', '咳嗽', 'missing'), fact('invented', '呕吐', 'good'), fact('ambiguous', '咳嗽', 'repeat')]
  assert.deepEqual(buildFrontDeskFactSources({ facts, messages }).map(source => source.id), ['good'])
})

test('captured contextQuestion is copied as context only; complete trusted metadata works with user-only source arrays', () => {
  const question = { id: 'temperature-question', text: '刚才体温是多少？', messageId: 'nurse-question', target: 'temperature_celsius', ignored: 'not copied' }
  const input = { facts: [fact('number', '39', 'answer')], messages: [message('answer', '39', { contextQuestion: question })] }
  const [source] = buildFrontDeskFactSources(input)
  assert.deepEqual(source.questionContext, { id: question.id, text: question.text, messageId: question.messageId, target: question.target })
  assert.equal(source.text, '39')
  assertTrueReferences([source], input.messages)
})

test('legacy answerQuestion falls back to an actual matching nurse question and cannot bind a changed or later question', () => {
  const q = { id: 'question-1', text: '这次实际喝了多少？', target: 'feeding_amount' }
  const nurse = message('nurse', q.text, { kind: 'assistant', inputAt: 10, understanding: { nextQuestion: q } })
  const answer = message('answer', '120ml', { inputAt: 20, answerTo: { questionId: q.id }, answerQuestion: { text: q.text } })
  const facts = [fact('amount', '120ml', 'answer')]
  assert.deepEqual(buildFrontDeskFactSources({ facts, messages: [nurse, answer] })[0].questionContext, { ...q, messageId: nurse.id })
  assert.equal(buildFrontDeskFactSources({ facts, messages: [{ ...nurse, text: '并没有问这个问题。' }, answer] })[0].questionContext, undefined)
  assert.equal(buildFrontDeskFactSources({ facts, messages: [{ ...nurse, inputAt: 30 }, answer] })[0].questionContext, undefined)
  assert.equal(buildFrontDeskFactSources({ facts, messages: [{ ...nurse, contextId: 'other-context' }, answer] })[0].questionContext, undefined)
})

test('different question contexts are not merged and an actual conflicting contextQuestion cannot override the real question', () => {
  const input = { facts: [fact('short', '没有', 'answer')], messages: [message('q', '有没有发热？', { kind: 'assistant', understanding: { nextQuestion: { id: 'q', text: '有没有发热？', target: 'fever' } } }), message('answer', '没有', { contextQuestion: { id: 'q', text: '有没有呕吐？', messageId: 'q', target: 'vomiting' } })] }
  assert.equal(buildFrontDeskFactSources(input)[0].questionContext, undefined)
  const metadata = id => ({ id, text: `${id}？`, messageId: `nurse-${id}`, target: id })
  const messages = [message('one', '没有', { contextQuestion: metadata('fever') }), message('two', '没有', { contextQuestion: metadata('vomiting') })]
  const multiple = fact('shared', '没有', 'one', { sources: [{ messageId: 'one', quote: '没有' }, { messageId: 'two', quote: '没有' }] })
  assert.equal(buildFrontDeskFactSources({ facts: [multiple], messages })[0].questionContext, undefined)
})
