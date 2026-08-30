import { cases } from './cases.mjs'

const textResults = {
  B01: ['PASS', ['体温39.2℃'], ['体温 39.2℃']],
  B02: ['FAIL', [], []],
  B03: ['FAIL', [], []],
  B04: ['PASS', [], []],
  B05: ['FAIL', [], []],
  B06: ['FAIL', [], []],
  B07: ['PARTIAL', ['呕吐'], ['昨晚：呕吐；原文保留“吐了两回，今朝没吐了”']],
  B08: ['PARTIAL', ['体温39.4℃', '呕吐'], ['半夜：体温39.4℃、呕吐；原文完整保留']],
  B09: ['FAIL', [], []],
  B10: ['PARTIAL', ['今天体温38.6℃'], ['今天：体温38.6℃；原文保留昨天39.6℃的修正过程']],
  B11: ['FAIL', [], []],
  B12: ['PARTIAL', ['咳嗽'], ['咳嗽；原文保留“偶尔、没发烧、没吐”']],
  B13: ['FAIL', [], []],
  B14: ['FAIL', [], []],
  B15: ['FAIL', [], []],
  B16: ['PASS', [], []]
}

const photoResults = {
  P01: ['FAIL', ['图片记录'], ['1条图片记录；1个附件；VISION_NOT_CONFIGURED'], ['report-evidence/P01-image-record.png']],
  P05: ['FAIL', ['8MB与21MB均被5MB上限拒绝', 'HEIC被格式限制拒绝'], [], ['report-evidence/P05-oversize-rejected.png']],
  P13: ['FAIL', ['图片记录'], ['无关桌面图仍写入1条记录和1个附件'], []],
  P15: ['FAIL', ['同一图片产生2个附件'], ['1条记录绑定2个重复附件'], []],
  P16: ['PARTIAL', ['三张图片按选择顺序绑定同一记录'], ['1条记录绑定3个附件；视觉分析均不可用'], ['report-evidence/P16-three-image-selection.png']],
  P17: ['PARTIAL', ['快速重复选择由P15覆盖并产生重复附件'], ['取消、断网、处理失败未执行'], []],
  P18: ['PARTIAL', ['两次选择至返回列表约4.6秒与4.9秒'], ['未能拆分压缩、上传、AI各阶段耗时'], []]
}

const controlledAudioEvidence = ['合成WAV已生成并通过RIFF检查', 'report-evidence/A-voice-permission-blocked.png']
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
      actualTimelineRows: ['自动化浏览器麦克风权限被拒；产品使用Web Speech API且无受控WAV注入接口']
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
      evidence: ['代表性图片P01返回VISION_NOT_CONFIGURED；未逐案伪造视觉结果']
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
