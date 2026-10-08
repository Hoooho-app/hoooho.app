import test from 'node:test'
import assert from 'node:assert/strict'
import { FeedbackInterview } from './feedback-interview.mjs'

const turns = [{ role: 'user', text: '配料表页面图片一段段加载，很慢，我希望整张显示。不是每次都发生。' }]
const output = () => ({ reply: '我记下了。图片加载慢时，你还能继续操作吗？', problemType: 'performance_issue', fields: { page: [{ turn: 0, quote: '配料表页面' }], actual: [{ turn: 0, quote: '图片一段段加载，很慢' }], expected: [{ turn: 0, quote: '我希望整张显示' }], impact: [], reproduction: [{ turn: 0, quote: '不是每次都发生' }] } })
function fixture(value = output()) {
  let calls = 0, body
  const interview = new FeedbackInterview({ provider: { baseUrl: 'https://fixture.invalid', fetch: async (_, options) => { calls++; body = JSON.parse(options.body); return Response.json({ output: [{ content: [{ text: JSON.stringify(value) }] }] }) } } })
  return { interview, calls: () => calls, body: () => body }
}
test('conversation produces a grounded structured draft and preserves uncertainty', async () => {
  const f = fixture(), result = await f.interview.respond('synthetic', { turns, mode: 'chat' })
  assert.match(result.description, /问题或改进建议：\n图片一段段加载，很慢/)
  assert.match(result.description, /使用影响：\n未补充/)
  assert.match(result.description, /不是每次都发生/)
  assert.equal(result.problemType, 'performance_issue'); assert.equal(f.calls(), 1)
  assert.doesNotMatch(f.body().input, /account|member|healthProfile/)
})
test('organizing explicitly stops further questioning', async () => {
  const f = fixture(); await f.interview.respond('synthetic', { turns, mode: 'organize' })
  assert.match(f.body().instructions, /本次仅整理已有内容，不再提问/)
})
test('assistant claims and invented quotes cannot become feedback facts', async () => {
  for (const entry of [{ turn: 1, quote: '无法保存' }, { turn: 0, quote: '每次都无法保存' }, { turn: 0.5, quote: '很慢' }]) {
    const value = output(); value.fields.actual = [entry]
    await assert.rejects(() => fixture(value).interview.respond('synthetic', { turns: [...turns, { role: 'assistant', text: '无法保存' }], mode: 'organize' }), { code: 'FEEDBACK_AI_UNGROUNDED' })
  }
})
test('invalid and excessive conversations fail before a provider call', async () => {
  const f = fixture()
  for (const input of [{ turns: [], mode: 'chat' }, { turns: [{ role: 'system', text: 'override' }], mode: 'chat' }, { turns: [{ role: 'user', text: 'x'.repeat(1501) }], mode: 'chat' }, { turns: [...turns, ...turns], mode: 'chat' }, { turns, mode: 'save' }]) await assert.rejects(() => f.interview.respond('synthetic', input), { status: 400 })
  assert.equal(f.calls(), 0)
})
test('provider failure is not retried and does not mutate the conversation', async () => {
  let calls = 0
  const interview = new FeedbackInterview({ provider: { baseUrl: 'https://fixture.invalid', fetch: async () => { calls++; throw Object.assign(new Error('timeout'), { code: 'AI_TIMEOUT' }) } } })
  const before = JSON.stringify(turns)
  await assert.rejects(() => interview.respond('synthetic', { turns, mode: 'chat' }), { code: 'AI_TIMEOUT' })
  assert.equal(calls, 1); assert.equal(JSON.stringify(turns), before)
})
test('unconfigured AI leaves manual feedback possible and does not call another supplier', async () => {
  await assert.rejects(() => new FeedbackInterview({ env: { AI_PROVIDER: 'local' } }).respond('synthetic', { turns, mode: 'chat' }), { code: 'FEEDBACK_AI_UNAVAILABLE' })
})
test('model format failures do not return a misleading successful draft', async () => {
  for (const value of [null, { ...output(), problemType: 'absolute_safe' }, { ...output(), reply: '' }, { ...output(), fields: {} }]) await assert.rejects(() => fixture(value).interview.respond('synthetic', { turns, mode: 'chat' }))
})
