import assert from 'node:assert/strict'
import test from 'node:test'
import { readProductionWorkflow } from './production-workflow.mjs'

const indexAI = report => Object.fromEntries(report.ai.map(row => [row.id, row]))

test('workflow graph references valid nodes and never treats retained infrastructure as an overseas production route', () => {
  const report = readProductionWorkflow({ env: {}, now: () => new Date('2026-11-07T01:00:00Z') })
  assert.equal(report.checkedAt, '2026-11-07T01:00:00.000Z')
  assert.deepEqual(report.runtime, { context: 'development', site: null, revision: null })
  assert.deepEqual(report.views.map(view => view.id), ['domestic', 'overseas', 'release'])
  for (const view of report.views) for (const stage of view.stages) for (const id of stage.nodes) assert.ok(report.nodes[id], id)
  for (const item of Object.values(report.nodes)) for (const id of item.next) assert.ok(report.nodes[id], id)
  assert.equal(report.nodes.legacy.state, 'retained')
  assert.equal(report.nodes.overseas.state, 'pending')
  assert.equal(indexAI(report).local.state, 'local')
})

test('Agent uses the actual distinct dialogue, recognition and speech selections without leaking credentials', () => {
  const report = readProductionWorkflow({
    env: {
      NODE_ENV: 'production', OPS_WORKFLOW_SITE: 'aliyun-hangzhou', OPS_WORKFLOW_RELEASE_SHA: 'a'.repeat(40),
      AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'SYNTHETIC_UNPRINTABLE_ROUTER_KEY', OPENROUTER_MODEL: 'example/text-test', OPENROUTER_VISION_MODEL: 'example/vision-test',
      ASR_PROVIDER: 'bailian', BAILIAN_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', BAILIAN_API_KEY: 'SYNTHETIC_UNPRINTABLE_BAILIAN_KEY',
    },
  })
  const ai = indexAI(report)
  assert.equal(report.runtime.site, '阿里云 ECS · 杭州')
  assert.equal(report.runtime.revision, 'a'.repeat(40))
  assert.deepEqual(ai.live.models, ['qwen3-asr-flash-realtime'])
  assert.deepEqual(ai.asr.models, ['qwen3-asr-flash'])
  assert.deepEqual(ai.dialogue.models, ['example/text-test'])
  assert.deepEqual(ai.vision.models, ['example/vision-test'])
  assert.equal(ai.asr.state, 'configured')
  assert.doesNotMatch(JSON.stringify(report), /SYNTHETIC_UNPRINTABLE|dashscope\.aliyuncs\.com/)
})

test('running ASR is taken from its instance and broken dialogue is not marked as configured or silently substituted', () => {
  const audioTranscription = { provider: { name: 'bailian-asr', apiKey: 'synthetic-key', model: 'running-instance-model' } }
  const ai = indexAI(readProductionWorkflow({ env: { AI_PROVIDER: 'local', ASR_PROVIDER: 'none', BAILIAN_API_KEY: 'synthetic-key', BAILIAN_BASE_URL: 'http://wrong.invalid' }, audioTranscription }))
  assert.deepEqual(ai.asr.models, ['running-instance-model'])
  assert.equal(ai.live.state, 'off')
  assert.equal(ai.dialogue.state, 'invalid')
  assert.equal(ai.vision.state, 'off')
})

test('old cloud metadata copied between environments is not taken as a release or location receipt', () => {
  const env = { NODE_ENV: 'production', RAILWAY_GIT_COMMIT_SHA: 'b'.repeat(40), RAILWAY_ENVIRONMENT_ID: 'old' }
  assert.deepEqual(readProductionWorkflow({ env }).runtime, { context: 'production', site: null, revision: null })
  assert.equal(indexAI(readProductionWorkflow({ env })).dialogue.state, 'off')
})

test('labelled lanes separate DNS traffic, historical registration, draft confirmation and read-only monitoring', () => {
  const report = readProductionWorkflow({ env: {} })
  const [domestic, overseas, release] = report.views
  const ids = lane => lane.steps.map(step => step.node)
  for (const view of report.views) {
    const index = new Set(view.stages.flatMap(stage => stage.nodes))
    for (const lane of view.lanes) {
      assert.ok(lane.steps.length >= 2)
      assert.ok(ids(lane).every(id => index.has(id)), lane.title)
      assert.ok(lane.steps.slice(1).every(step => step.via?.trim()), lane.title)
    }
  }
  assert.deepEqual(domestic.stages.map(stage => stage.title), ['产品端','域名','访问入口','生产环境','业务','处理','存储','结果','运营'])
  assert.equal(report.nodes.godaddy.state, 'history')
  assert.deepEqual(ids(domestic.lanes.find(lane => lane.tone === 'history')), ['godaddy','registrar','domain'])
  assert.deepEqual(ids(domestic.lanes.find(lane => lane.tone === 'traffic')), ['web','domain','gateway','origin','api'])
  assert.deepEqual(ids(domestic.lanes.find(lane => lane.title === 'AI 整理后保存')), ['api','agent','review','store','delivery'])
  assert.deepEqual(ids(domestic.lanes.find(lane => lane.title === '录音中字幕')), ['api','agent','subtitle'])
  assert.ok(domestic.lanes.filter(lane => lane.tone === 'observe').every(lane => ids(lane).at(-1) === 'monitor'))
  assert.equal(overseas.lanes[0].tone, 'pending')
  assert.ok(release.lanes.every(lane => ids(lane)[0] === 'code'))
})
