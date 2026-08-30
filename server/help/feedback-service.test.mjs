import assert from 'node:assert/strict'
import test from 'node:test'
import { FeedbackService } from './feedback-service.mjs'

const imageBuffer = (index = 1) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`image-${index}`)])
const image = (index = 1) => ({ name: `${index}.jpg`, type: 'image/jpeg', dataUrl: `data:image/jpeg;base64,${imageBuffer(index).toString('base64')}` })
function setup() {
  let data = { feedback: [], attachments: [], messages: [], statusHistory: [] }
  const files = new Map()
  const store = { read: async () => data, update: async (update) => { data = await update(data); return data } }
  const storage = { save: async (key, value) => { files.set(key, value) }, read: async (key) => files.get(key), remove: async (key) => files.delete(key) }
  return { service: new FeedbackService({ store, storage, tokenSecret: 'test-secret' }), get data() { return data }, files }
}
const input = (overrides = {}) => ({ category: '功能异常', problemPage: '健康事件', problemType: '功能异常', description: '帮助中心搜索后页面没有响应', sourcePath: '/help?q=test', sourceName: '帮助中心', appVersion: '1.0.0', device: { type: 'mobile', os: 'iOS', browser: 'Safari', screen: '390×844' }, idempotencyKey: 'request-123456', attachments: [], ...overrides })

test('text feedback persists privacy-limited environment and idempotent retries do not duplicate', async () => {
  const state = setup(), first = await state.service.create('account-1', input(), new Date('2026-08-27T00:00:00Z')), second = await state.service.create('account-1', input(), new Date('2026-08-27T00:01:00Z'))
  assert.equal(first.id, second.id); assert.equal(second.duplicate, true); assert.equal(state.data.feedback.length, 1)
  assert.deepEqual(state.data.feedback[0].device, { type: 'mobile', os: 'iOS', browser: 'Safari', screen: '390×844' })
  assert.deepEqual({ problemPage: state.data.feedback[0].problemPage, problemType: state.data.feedback[0].problemType }, { problemPage: '健康事件', problemType: '功能异常' })
  assert.equal('healthRecord' in state.data.feedback[0], false)
})

test('legacy feedback remains readable without the two-dimensional classification fields', async () => {
  const state = setup(), created = await state.service.create('account-1', input({ category: '出现错误', problemPage: undefined, problemType: undefined }))
  const record = await state.service.getForAccount('account-1', created.id)
  assert.equal(record.problemPage, null)
  assert.equal(record.problemType, '出现错误')
})

test('image-only feedback accepts the tenth image and rejects the eleventh', async () => {
  const state = setup(), attachments = Array.from({ length: 10 }, (_, index) => image(index))
  const result = await state.service.create('account-1', input({ description: '', attachments }))
  assert.equal(state.data.attachments.length, 10); assert.equal((await state.service.getForAccount('account-1', result.id)).attachmentCount, 10)
  await assert.rejects(() => state.service.create('account-1', input({ idempotencyKey: 'another-request', attachments: [...attachments, image(11)] })), /最多 10 张/)
})

test('empty feedback is rejected while text-only feedback remains valid', async () => {
  const state = setup()
  await assert.rejects(() => state.service.create('account-1', input({ description: '', attachments: [] })), /填写反馈或添加图片/)
  const created = await state.service.create('account-1', input({ description: '只有文字也可以提交' }))
  assert.ok(created.id)
})

test('users see replies and supplements but never internal notes or internal priority', async () => {
  const state = setup(), created = await state.service.create('account-1', input())
  await state.service.addUserMessage('account-1', created.id, { text: '刷新后仍然存在', attachments: [image()] })
  await state.service.addOpsMessage('operator-1', created.id, { kind: 'internal-note', text: '需要研发确认日志' })
  await state.service.addOpsMessage('operator-1', created.id, { kind: 'user-reply', text: '我们正在查看这个问题' })
  await state.service.updateFromOps('operator-1', created.id, { status: 'evaluating', priority: 'high' })
  const user = await state.service.getForAccount('account-1', created.id), ops = await state.service.getForOps(created.id)
  assert.deepEqual(user.messages.map((item) => item.kind), ['user-supplement', 'user-reply'])
  assert.equal('priority' in user, false); assert.equal(ops.messages.some((item) => item.kind === 'internal-note'), true); assert.equal(user.status, 'evaluating')
})

test('feedback ownership, decline reasons and merge targets are enforced', async () => {
  const state = setup(), created = await state.service.create('account-1', input())
  await assert.rejects(() => state.service.getForAccount('account-2', created.id), /不存在/)
  await assert.rejects(() => state.service.updateFromOps('operator', created.id, { status: 'declined' }), /必须填写/)
  await assert.rejects(() => state.service.updateFromOps('operator', created.id, { status: 'merged' }), /必须关联/)
  await assert.rejects(() => state.service.updateFromOps('operator', created.id, { status: 'merged', mergedIntoId: 'missing' }), /不存在或不能关联自身/)
  const declined = await state.service.updateFromOps('operator', created.id, { status: 'declined', noActionReason: '当前版本暂不支持该设备' })
  assert.equal(declined.noActionReason, '当前版本暂不支持该设备')
})

test('attachment links are short lived and invalid signatures are rejected', async () => {
  const state = setup(), created = await state.service.create('account-1', input({ attachments: [image()] })), detail = await state.service.getForAccount('account-1', created.id)
  const url = new URL(detail.attachments[0].url, 'https://hoooho.test'), expires = url.searchParams.get('expires'), access = url.searchParams.get('access')
  const result = await state.service.readAttachmentWithAccess(detail.attachments[0].id, expires, access, Number(expires) - 1)
  assert.deepEqual(result.buffer, imageBuffer(1))
  await assert.rejects(() => state.service.readAttachmentWithAccess(detail.attachments[0].id, expires, 'bad', Number(expires) - 1), /失效/)
})

test('deleting an owned feedback removes messages, history, metadata and private files', async () => {
  const state = setup(), created = await state.service.create('account-1', input({ attachments: [image()] }))
  await state.service.addUserMessage('account-1', created.id, { text: '补充', attachments: [] })
  await state.service.deleteForAccount('account-1', created.id)
  assert.deepEqual({ feedback: state.data.feedback.length, attachments: state.data.attachments.length, messages: state.data.messages.length, history: state.data.statusHistory.length, files: state.files.size }, { feedback: 0, attachments: 0, messages: 0, history: 0, files: 0 })
})
