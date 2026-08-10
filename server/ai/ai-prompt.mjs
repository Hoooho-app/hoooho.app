const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] }

export const healthAIOutputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: ['symptom', 'temperature', 'medication', 'visit', 'examination', 'concern', 'status_change'] },
          name: { type: 'string' },
          bodyPart: nullableString,
          target: nullableString,
          change: { anyOf: [{ type: 'string', enum: ['improved', 'worsened', 'persistent'] }, { type: 'null' }] },
          sourceText: { type: 'string' },
          time: {
            type: 'object',
            additionalProperties: false,
            properties: {
              raw: nullableString,
              resolvedStart: nullableString,
              resolvedEnd: nullableString,
              precision: { type: 'string', enum: ['exact', 'period', 'day', 'month', 'year', 'fuzzy', 'unknown'] }
            },
            required: ['raw', 'resolvedStart', 'resolvedEnd', 'precision']
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          temperature: {
            anyOf: [
              { type: 'null' },
              {
                type: 'object',
                additionalProperties: false,
                properties: { min: { type: 'number' }, max: { type: 'number' }, unit: { type: 'string', enum: ['℃'] } },
                required: ['min', 'max', 'unit']
              }
            ]
          }
        },
        required: ['type', 'name', 'bodyPart', 'target', 'change', 'sourceText', 'time', 'confidence', 'temperature']
      }
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 }
  },
  required: ['facts', 'confidence']
}

export const healthEventOrganizerInstructions = `你是 Hoooho 的健康事实提取器，运行在后台。把用户原文拆成彼此独立的健康事实；同一句话可以产生多个事实，每个事实必须保留对应 sourceText 和自己的原始时间表达 time.raw。只提取用户明确陈述的事实，不诊断疾病，不判断严重程度，不推测病因，不提供治疗、用药或风险建议。

type 仅可为 symptom、temperature、medication、visit、examination、concern、status_change。身体位置放入 bodyPart 独立字段，例如“左手腕疼”应为 name="疼痛"、bodyPart="左手腕"。多个不同时间的体温必须生成多个 temperature fact。temperature fact 同时填写 temperature 对象；其他类型 temperature 必须为 null。注意否定表达：“没有发烧”不能生成发热、体温或状态变化事实。担心、疑问和猜测只能进入 concern。

状态变化使用 status_change：好转、减轻、退了一些使用 change="improved"；加重、越来越严重、烧得更高使用 change="worsened"；持续、一直存在、仍未缓解使用 change="persistent"。target 填被改变的症状，例如“昨晚发烧，今天好多了”应关联 target="发热"。status_change 的 name 使用简短事实名称，例如“发热好转”；非 status_change 的 target 和 change 必须为 null。

本阶段不做完整时间解析：保留“昨天晚上”“今天早上”等原话到 time.raw；resolvedStart 和 resolvedEnd 返回 null；precision 按原话标记 exact、period、day、month、year、fuzzy 或 unknown。没有健康事实时 facts 返回空数组。输出必须符合 JSON Schema。`

export function buildHealthEventOrganizerInput(rawInput) {
  return `请把下面这段家庭健康描述拆成独立、可追溯的健康事实。不要总结，不要添加原文没有的信息：\n\n${rawInput}`
}
