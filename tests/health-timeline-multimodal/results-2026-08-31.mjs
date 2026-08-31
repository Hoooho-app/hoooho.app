import { cases } from './cases.mjs'

const textResults = {
  B01: ['PASS', ['体温39.2℃'], ['体温 39.2℃']],
  B02: ['PASS', ['发热再次出现'], ['发热 · recurrent']],
  B03: ['PASS', ['无发热', '发热已消退'], ['发热 negated；发热 resolved']],
  B04: ['PASS', [], []],
  B05: ['PASS', ['药物待确认5毫升'], ['药物待确认 · requiresConfirmation']],
  B06: ['PASS', ['体温39.1℃', '精神状态差'], ['体温39.1℃；精神状态差']],
  B07: ['PASS', ['昨晚呕吐2次', '今天无呕吐'], ['昨晚：呕吐2次；今朝：呕吐 negated/resolved']],
  B08: ['PASS', ['体温39.4℃', '呕吐2次', '精神状态差'], ['半夜：体温39.4℃、呕吐2次；刚才：精神状态差']],
  B09: ['PASS', ['右手臂发红', '抓挠'], ['右手臂发红；抓挠']],
  B10: ['PASS', ['昨天体温39.6℃', '今天体温38.6℃'], ['昨天39.6℃；今天38.6℃；撤销旧的昨天38.6℃']],
  B11: ['PASS', ['体温约38至39℃'], ['体温38-39℃范围']],
  B12: ['PASS', ['偶尔咳嗽', '无发热', '无呕吐'], ['咳嗽 affirmed；发热/呕吐 negated']],
  B13: ['PARTIAL', [], ['无可靠上文时安全地不猜测症状']],
  B14: ['PASS', ['血氧93%', '心率128次/分', '体温正常'], ['三个独立测量/状态事实']],
  B15: ['PASS', ['10:00 美林5毫升'], ['10:00：美林 5毫升']],
  B16: ['PASS', [], []]
}

const photoResults = {
  P01: ['BLOCKED', [], ['VISION_NOT_CONFIGURED；草稿被拒绝，零正式记录/附件'], ['server/events/event-attachment-service.test.mjs']],
  P05: ['PARTIAL', ['客户端自动缩放、方向纠正、去元数据与压缩；HEIC可解码时转换，否则明确提示'], [], ['src/features/health-attachments/prepareHealthImage.test.ts']],
  P13: ['PASS', [], ['无关判定后零正式记录/附件'], ['server/events/event-attachment-service.test.mjs']],
  P15: ['PASS', ['同一事件相同内容只保留一次'], ['内容哈希原子去重，改名/并发不重复'], ['server/events/event-attachment-service.test.mjs']],
  P16: ['PARTIAL', ['三张图片按选择顺序绑定同一记录'], ['1条记录绑定3个附件；视觉分析均不可用'], ['report-evidence/P16-three-image-selection.png']],
  P17: ['PASS', [], ['未配置、失败、无关和不安全结果均零正式入库'], ['server/events/event-attachment-service.test.mjs']],
  P18: ['PARTIAL', ['两次选择至返回列表约4.6秒与4.9秒'], ['未能拆分压缩、上传、AI各阶段耗时'], []]
}

const controlledAudioEvidence = ['真实WAV文件已通过ASR适配器单元测试；当前环境未配置真实ASR凭证', 'server/ai/audio-transcription-service.test.mjs', 'report-evidence/A-voice-permission-blocked.png']
const visionBlocked = new Set(['P02', 'P03', 'P04', 'P06', 'P09', 'P10', 'P11', 'P14'])
const multimodalBlocked = new Set(['P07', 'P08', 'P12', 'M01', 'M02', 'M03', 'M04', 'M05', 'M06'])

export const results = cases.map((item) => {
  const base = { ...item }
  if (item.caseId.startsWith('A')) {
    return {
      ...base,
      result: 'BLOCKED',
      evidence: controlledAudioEvidence,
      actualTranscript: null,
      actualFacts: [],
      actualTimelineRows: ['文件ASR接口已实现；自动化浏览器麦克风权限仍被拒，且无真实ASR凭证，未伪报转写成功']
    }
  }
  if (textResults[item.caseId]) {
    const [result, actualFacts, actualTimelineRows] = textResults[item.caseId]
    return {
      ...base,
      result,
      actualTranscript: item.referenceTranscript,
      actualFacts,
      actualTimelineRows,
      evidence: ['.artifacts/b-results.json', item.caseId === 'B08' ? 'report-evidence/B08-complex-text-timeline.png' : '隔离数据文件与页面快照']
    }
  }
  if (photoResults[item.caseId]) {
    const [result, actualFacts, actualTimelineRows, evidence] = photoResults[item.caseId]
    return { ...base, result, actualFacts, actualTimelineRows, evidence: ['隔离附件/记录数据文件', ...evidence] }
  }
  if (visionBlocked.has(item.caseId)) {
    return {
      ...base,
      result: 'BLOCKED',
      actualFacts: [],
      actualTimelineRows: [],
      evidence: ['视觉提供商未配置；草稿预检返回VISION_NOT_CONFIGURED且零正式入库；未伪造视觉成功']
    }
  }
  if (multimodalBlocked.has(item.caseId)) {
    return {
      ...base,
      result: 'BLOCKED',
      actualTranscript: null,
      actualFacts: [],
      actualTimelineRows: [],
      evidence: ['视觉提供商未配置；自动化麦克风无权限；普通时间轴无受控音频文件注入链路']
    }
  }
  throw new Error(`Missing result for ${item.caseId}`)
})
