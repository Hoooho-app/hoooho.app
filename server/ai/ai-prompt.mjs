const factArraySchema = {
  type: 'array',
  items: {
    type: 'object', additionalProperties: false,
    properties: { content: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' } } },
    required: ['content', 'keywords']
  }
}

export const organizedHealthDataSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    symptoms: factArraySchema,
    temperature: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object', additionalProperties: false,
          properties: { min: { type: 'number' }, max: { type: 'number' }, unit: { type: 'string', enum: ['℃'] } },
          required: ['min', 'max', 'unit']
        }
      ]
    },
    medications: factArraySchema,
    visits: factArraySchema,
    examinations: factArraySchema,
    concerns: factArraySchema,
    attachments: factArraySchema,
    timeline: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          time: { type: 'string' }, content: { type: 'string' }, relatedSymptoms: { type: 'array', items: { type: 'string' } }
        },
        required: ['time', 'content', 'relatedSymptoms']
      }
    }
  },
  required: ['symptoms', 'temperature', 'medications', 'visits', 'examinations', 'concerns', 'attachments', 'timeline']
}

export const healthEventOrganizerInstructions = `你是 Hoooho 的健康事实整理器，运行在后台。只提取用户明确陈述的事实，不诊断疾病，不判断严重程度，不推测病因，不提供治疗、用药或风险建议。注意否定表达，例如“没有发烧”不能提取为发热。担心、疑问和猜测只能进入 concerns。识别单点体温和范围体温，例如“38度5”“37-38℃”“37到38度”“37～38℃”。按原文时间关系拆分 timeline；明确时间、相对时间和先后顺序都要保留，例如“早上7点”“今早”“晚上”“夜里”“凌晨”“昨天”“今天下午”。不要把多个不同时间的事实合并为一个节点。页面会将口语时间映射为统一时间段：凌晨或半夜 00:00–06:00、早上或今早 06:00–09:00、上午 09:00–12:00、中午 12:00–13:00、下午 13:00–18:00、晚上 18:00–21:00、夜里或夜间 21:00–24:00。没有明确事实的字段必须为空数组或 null。attachments 永远返回空数组，因为附件只能来自用户真实上传。输出必须符合 JSON Schema。`

export function buildHealthEventOrganizerInput(rawInput) {
  return `请把下面这段家庭健康记录整理为结构化健康事实和事件时间线。保留事实原意，不添加医学判断：\n\n${rawInput}`
}
