// Static entrance examples only. Never used as record input or a draft seed.
export const quickNoteExamples = [
  '换了洗衣液，身上起了红疹',
  '上午测到体温38.2℃',
  '吃过鸡蛋后，嘴边出现红疹',
  '摸过小猫后，眼睛痒、打喷嚏',
  '打扫房间后，鼻子痒、流鼻涕',
  '换了配方奶，记下喝奶的情况',
  '喝奶后，嘴边发红、身上发痒',
  '今天大便偏稀，已经三次了',
  '手臂涂了面霜，之后有点发红',
  '吃过虾后，身上起了红疙瘩',
] as const

export const quickNoteTiming = { type: 90, hold: 2200, delete: 45, empty: 300 } as const
