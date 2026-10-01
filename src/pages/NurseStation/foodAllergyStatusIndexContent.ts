export const FOOD_ALLERGY_INDEX_FORMULA = '记录完整度 = 四舍五入〔K ÷ (4 × N) × 100〕%'
export const FOOD_ALLERGY_INDEX_DIMENSIONS = [
  { key: 'A', title: '反应严重程度', description: '明确记录的轻度、中度、重度，或已关联症状的影响程度；只有症状名称不算完整。' },
  { key: 'B', title: '处理情况', description: '该次反应的明确处理或治疗，包括明确未用药／未治疗；普通长期用药不计入。' },
  { key: 'C', title: '相关摄入量', description: '与该次反应关联、带数量和单位的摄入量；无反应的摄入量不计入。' },
  { key: 'H', title: '既往反应与证据', description: '明确的既往反应、无既往反应，或已核对的结构化检测结果；原始图片和未解析文本不补全字段。' },
] as const
export const FOOD_ALLERGY_INDEX_SOURCES = [
  ['过敏史', '已保存的食物条目、反应及结构化检测结果。'],
  ['健康随记', '已明确关联食物的症状及该次反应的处理记录。'],
  ['就医记录或报告', '有稳定关联且已结构化、可追溯的信息；原始文件保留为待整理资料。'],
  ['排敏测试记录', '已保存、未撤回的有效食物关联观察。'],
] as const
