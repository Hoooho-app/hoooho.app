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
          type: { type: 'string', enum: ['symptom', 'temperature', 'medication', 'visit', 'examination', 'diagnosis', 'concern', 'status_change', 'other'] },
          category: { type: 'string', enum: ['symptom', 'measurement', 'medication', 'examination', 'diagnosis', 'visit', 'concern', 'status_change', 'other'] },
          concept: { type: 'string' },
          name: { type: 'string' },
          bodyPart: nullableString,
          bodyRegion: nullableString,
          laterality: nullableString,
          severity: nullableString,
          severityScale: nullableString,
          frequency: nullableString,
          occurrenceCount: { anyOf: [{ type: 'number' }, { type: 'null' }] },
          duration: nullableString,
          assertionType: { type: 'string', enum: ['observation', 'negative_observation', 'state_change', 'correction'] },
          target: nullableString,
          change: { anyOf: [{ type: 'string', enum: ['improved', 'worsened', 'persistent', 'recurred', 'resolved', 'unchanged', 'corrected'] }, { type: 'null' }] },
          sourceText: { type: 'string' },
          originalText: { type: 'string' },
          polarity: { type: 'string', enum: ['affirmed', 'negated', 'uncertain'] },
          temporality: { type: 'string', enum: ['current', 'historical', 'future', 'conditional', 'unknown'] },
          status: { type: 'string', enum: ['active', 'improving', 'resolved', 'recurrent', 'planned', 'not_applicable', 'unknown'] },
          subject: { type: 'string', enum: ['event_subject', 'family_member', 'other_person', 'unknown'] },
          source: { type: 'string', enum: ['user_report', 'measurement', 'doctor_statement', 'test_result', 'ai_consultation', 'structured_input', 'quoted_text', 'internet_information', 'unknown'] },
          medicationAction: { anyOf: [{ type: 'string', enum: ['taken', 'not_taken', 'planned', 'available', 'stopped', 'unknown'] }, { type: 'null' }] },
          diagnosisCertainty: { anyOf: [{ type: 'string', enum: ['confirmed', 'suspected', 'ruled_out', 'pending', 'unknown'] }, { type: 'null' }] },
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
        required: ['type', 'category', 'concept', 'name', 'bodyPart', 'bodyRegion', 'laterality', 'severity', 'severityScale', 'frequency', 'occurrenceCount', 'duration', 'assertionType', 'target', 'change', 'sourceText', 'originalText', 'polarity', 'temporality', 'status', 'subject', 'source', 'medicationAction', 'diagnosisCertainty', 'time', 'confidence', 'temperature']
      }
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 }
  },
  required: ['facts', 'confidence']
}

export const healthEventOrganizerInstructions = `你是 Hoooho 的健康事实提取器，运行在后台。把用户原文拆成彼此独立的健康事实；同一句话可以产生多个事实，每个事实必须保留对应 sourceText 和自己的原始时间表达 time.raw。只提取用户明确陈述的事实，不诊断疾病，不判断严重程度，不推测病因，不提供治疗、用药或风险建议。

每条事实必须显式标注 category、concept、polarity、temporality、status、subject 和 source。区分当前记录对象、家人和他人；区分本人陈述、测量、医生陈述、检查结果、引用文本和网络信息。否定、条件、引用、他人经历和已纠正内容不得伪装成当前阳性事实。用药必须标注 medicationAction，只有明确已服用才是 taken；诊断必须标注 diagnosisCertainty。医生明确诊断使用 doctor_statement + confirmed，正式检查明确结论使用 test_result + confirmed；用户明确转述“已确诊/确诊了某病”时保留 user_report 来源并标记 confirmed。仅出现疾病名称、普通症状、猜测、疑似或 AI 判断不得标记 confirmed。originalText 必须逐字保留对应原文。

type 可为 symptom、temperature、medication、visit、examination、diagnosis、concern、status_change、other。身体位置放入 bodyPart，并把不含左右的区域放入 bodyRegion、侧别放入 laterality。只提取原文明确表达的程度、评分、频率、次数和持续时长，分别放入 severity、severityScale、frequency、occurrenceCount、duration；不得自行推断。例如“右侧小腿严重疼痛两小时”应保留右侧、小腿、严重和两小时。多个不同时间的体温必须生成多个 temperature fact。temperature fact 同时填写 temperature 对象；其他类型 temperature 必须为 null。阴性观察必须保留为 polarity="negated"、assertionType="negative_observation"，但不得伪装成当前阳性事实。担心、疑问和猜测只能进入 concern 或 uncertain fact。

状态变化使用 status_change：好转、减轻、退了一些使用 change="improved"；加重、越来越严重、烧得更高使用 change="worsened"；持续、一直存在、仍未缓解使用 change="persistent"；复发、又出现使用 change="recurred"；明确消失、不再存在使用 change="resolved"。target 填被改变的症状，例如“昨晚发烧，今天好多了”应关联 target="发热"。status_change 的 name 使用简短事实名称，例如“发热好转”；非 status_change 的 target 和 change 必须为 null。外部 AI 问诊结论的 source 必须为 ai_consultation、diagnosisCertainty 必须为 suspected，绝不能标记 confirmed。

本阶段不做完整时间解析：保留“昨天晚上”“今天早上”等原话到 time.raw；resolvedStart 和 resolvedEnd 返回 null；precision 按原话标记 exact、period、day、month、year、fuzzy 或 unknown。没有健康事实时 facts 返回空数组。输出必须符合 JSON Schema。`

export function buildHealthEventOrganizerInput(rawInput) {
  return `请把下面这段家庭健康描述拆成独立、可追溯的健康事实。不要总结，不要添加原文没有的信息：\n\n${rawInput}`
}
