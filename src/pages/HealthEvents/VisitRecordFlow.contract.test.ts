import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const flow = readFileSync(new URL('./VisitRecordFlow.tsx', import.meta.url), 'utf8')
const recorder = readFileSync(new URL('./JournalRecorder.tsx', import.meta.url), 'utf8')
const workspace = readFileSync(new URL('../../features/visit-materials/VisitMaterialsWorkspace.tsx', import.meta.url), 'utf8')
const model = readFileSync(new URL('../../features/visit-materials/useVisitMaterials.ts', import.meta.url), 'utf8')
const types = readFileSync(new URL('../../features/visit-materials/types.ts', import.meta.url), 'utf8')

test('visit entry delegates to the approved materials workspace with its navigation and identity', () => {
  assert.match(recorder, /category === 'visit' \? 'visit-form'/)
  assert.match(flow, /<VisitMaterialsWorkspace/)
  for (const prop of ['memberId', 'token', 'onBack', 'onClose', 'onSaved', 'onViewRecord']) assert.ok(flow.includes(`${prop}={${prop}}`), prop)
  for (const label of ['核对资料', '就诊资料', '拍照', '相册', 'PDF', '粘贴']) assert.ok(workspace.includes(label), label)
})
test('visit materials retain originals, unverified status and the factual safety boundary', () => {
  for (const label of ['对照原件', 'AI 参考，尚未经医生确认。', '当前孩子还没有可关联的症状事件']) assert.ok(workspace.includes(label), label)
  assert.match(model, /categories: \['visit'\]/)
  assert.match(model, /mode === 'reviewed' \? 'user_edited' : 'draft_unverified'/)
  assert.match(model, /一次最多12份文件、总大小15 MB/)
  assert.match(model, /identity: visitMaterialIdentity\(snapshot.materials.source\)/)
  assert.doesNotMatch(workspace, /GPS|地图|推荐医院|推荐科室|AI已确认|诊断已核验|治疗建议/)
})
test('hospital, online doctor and external AI identities remain distinct; occurrence time is bounded', () => {
  for (const source of ['hospital', 'online_doctor', 'external_ai']) assert.ok(types.includes(`'${source}'`), source)
  for (const label of ['医院', '科室', 'AI 软件或平台', '问诊平台 / 医生']) assert.ok(workspace.includes(label), label)
  assert.match(workspace, /max=\{localDateTimeValue\(\)\}/)
  assert.doesNotMatch(workspace, /医生姓名（选填）|备注（选填）/)
})
