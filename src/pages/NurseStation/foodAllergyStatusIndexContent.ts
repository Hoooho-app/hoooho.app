export const FOOD_ALLERGY_INDEX_STATUS = {
  kind: 'unavailable',
  label: '暂未开放计算',
  description: '计算方法仍在验证中。',
} as const

export const FOOD_ALLERGY_INDEX_FORMULAS = [
  { key: 'index', accessible: 'I 下标 t 等于一减 L 下标 t，再乘以百分之百' },
  { key: 'burden', accessible: 'L 下标 t 等于 G theta 对所有食物状态的汇总' },
  { key: 'food', accessible: '第 j 种食物的状态等于 F phi 对 A、B、C、H 的评估' },
] as const

export const FOOD_ALLERGY_INDEX_DIMENSIONS = [
  { key: 'A', title: '反应严重程度', description: '描述一次相关食物过敏反应的表现及严重程度。' },
  { key: 'B', title: '治疗强度', description: '指同一次反应实际需要的处理或治疗强度，不把长期维持用药、日常服药次数直接等同于该维度。' },
  { key: 'C', title: '诱发剂量', description: '指有证据支持的、引发反应的摄入剂量。已经吃过且未出现反应的量，不自动等同于诱发剂量。' },
] as const

export const FOOD_ALLERGY_INDEX_VARIABLES = [
  ['Iₜ', '当前展示指数。'],
  ['Lₜ', '归一化后的总体负担。'],
  ['Sⱼ,ₜ', '第 j 种食物在当前时点的状态。'],
  ['A、B、C', '对应反应严重程度、治疗强度、诱发剂量。'],
  ['Hⱼ', '该食物相关的既往反应与证据。'],
  ['Fφ、Gθ', '食物状态评估与总体汇总的待验证方法。'],
] as const

export const FOOD_ALLERGY_INDEX_SOURCES = [
  ['过敏史', '相关食物、既往反应及已记录信息。'],
  ['健康随记', '相关症状、发生时间、处理经过。'],
  ['就医记录或已上传报告', '已有的诊断、检查及医生记录。'],
  ['排敏测试记录', '已记录的相关结果，按实际证据使用。'],
] as const
