export type GuideFilterId = 'all' | 'first' | 'record' | 'visit' | 'family'
export type GuideSectionId = 'record' | 'observe' | 'visit' | 'family'

export interface GuideMedia {
  poster: string
  video: string
}

export interface GuideTutorial {
  actionLabel: string
  actionTo: string
  context: string
  core?: boolean
  filterIds: GuideFilterId[]
  id: string
  keywords: string[]
  media?: GuideMedia
  result: string
  section: GuideSectionId
  steps: string[]
  title: string
}

export const guideFilters: Array<{ description: string; id: Exclude<GuideFilterId, 'all'>; label: string }> = [
  { id: 'first', label: '第一次使用', description: '先看最常用的三个流程' },
  { id: 'record', label: '记录健康问题', description: '新建、补充与更正记录' },
  { id: 'visit', label: '准备去看医生', description: '整理并带走已有资料' },
  { id: 'family', label: '管理家人和档案', description: '切换人物，完善健康背景' }
]

export const guideSectionLabels: Record<GuideSectionId, { description: string; title: string }> = {
  record: { title: '记录健康问题', description: '把刚刚发生的情况，准确地留在对应健康随记里。' },
  observe: { title: '持续观察', description: '从时间线和变化趋势里，看到事情是怎么发展的。' },
  visit: { title: '准备就诊', description: '使用已经整理好的内容，减少临场回忆和重复输入。' },
  family: { title: '家人和健康档案', description: '每条记录归到正确的人，长期信息慢慢补全。' }
}

const coreMedia = (id: string): GuideMedia => ({
  poster: `/tutorials/posters/${id}.webp`,
  video: `/tutorials/recordings/${id}.webm`
})

export const guideTutorials: GuideTutorial[] = [
  {
    id: 'create-event', title: '孩子半夜发热，怎么快速记录？', context: '刚测完体温，想把开始时间、温度和当前情况一起留下。',
    section: 'record', filterIds: ['first', 'record'], core: true, media: coreMedia('create-event'),
    keywords: ['一句话', '记录新情况', '快捷记录', '发热', '体温', '第一次', '孩子'],
    steps: ['记录新情况', '用一句话写下发生了什么', '核对时间与描述后保存'],
    result: '建立一条发热健康随记，第一条记录和体温变化会进入时间线。', actionLabel: '现在去记录', actionTo: '/health-events'
  },
  {
    id: 'continue-event', title: '体温又变了，怎么接着补充？', context: '同一件事还在发展，不需要重新建立健康随记。',
    section: 'observe', filterIds: ['first', 'record'], core: true, media: coreMedia('continue-event'),
    keywords: ['继续记录', '补充', '新增记录', '症状变化', '体温变化', '时间线'],
    steps: ['打开已有健康随记', '点快捷记录并描述新变化', '检查整理结果后确认'],
    result: '新增内容出现在原健康随记的时间线中，体温趋势也会同步更新。', actionLabel: '查看健康随记', actionTo: '/health-events'
  },
  {
    id: 'prepare-doctor', title: '准备问医生，怎么带走病情资料？', context: '不想在问诊时从头回忆，可以先使用健康随记中已经整理好的内容。',
    section: 'visit', filterIds: ['first', 'visit'], core: true, media: coreMedia('prepare-doctor'),
    keywords: ['医生', '就诊', '在线问诊', '病情描述', '复制', '资料', '下一步'],
    steps: ['打开健康随记详情的“下一步”', '进入在线问诊资料', '复制病情描述或全部内容'],
    result: '可以把已整理的病情描述复制到当前问诊渠道继续使用。', actionLabel: '去选择一条健康随记', actionTo: '/health-events'
  },
  {
    id: 'backdate-first-record', title: '昨天开始不舒服，现在还能补记吗？', context: '事情不是刚刚发生，也可以先调整开始时间再保存。',
    section: 'record', filterIds: ['record'], keywords: ['昨天', '过去', '补记', '开始时间', '发生时间'],
    steps: ['记录新情况', '把开始时间改为实际发生时间', '填写情况并保存'], result: '内容会按实际发生时间进入健康随记。',
    actionLabel: '开始补记', actionTo: '/health-events'
  },
  {
    id: 'correct-recognition', title: '自动整理不准确，怎么修改？', context: '确认前发现体温、时间或描述不对，可以先返回文字修改。',
    section: 'record', filterIds: ['record'], keywords: ['识别不准确', '自动整理', '修改', '更正', '体温', '时间'],
    steps: ['在整理预览里点“修改”', '更正原始描述', '重新整理并确认'], result: '保存的是你最后确认过的内容。',
    actionLabel: '去打开一条健康随记', actionTo: '/health-events'
  },
  {
    id: 'upload-first-photo', title: '有检查单或药盒照片，怎么一起记录？', context: '第一次记录健康随记时，可以把相关图片和文字放在同一条记录里。',
    section: 'record', filterIds: ['record'], keywords: ['图片', '照片', '检查单', '药盒', '附件', '上传'],
    steps: ['记录新情况', '在附件补充中选择图片', '核对文字和时间后保存'], result: '图片会归到这条健康随记中。',
    actionLabel: '开始一次记录', actionTo: '/health-events'
  },
  {
    id: 'read-timeline', title: '事情发展了几天，怎么从头看完整过程？', context: '同一条健康随记里的每次补充，会按发生时间集中展示。',
    section: 'observe', filterIds: ['record'], keywords: ['时间线', '完整过程', '顺序', '记录详情', '发生了什么', '措施'],
    steps: ['打开一条健康随记', '查看按日期分组的时间线', '展开单条记录查看细节'], result: '症状、体温和已经采取的措施会沿时间顺序呈现。',
    actionLabel: '查看健康随记', actionTo: '/health-events'
  },
  {
    id: 'temperature-trend', title: '体温忽高忽低，怎么查看变化？', context: '健康随记中记录过多个体温后，会出现体温趋势。',
    section: 'observe', filterIds: ['record'], keywords: ['体温', '趋势', '变化', '高热', '低热', '测量'],
    steps: ['连续记录至少两次体温', '回到健康随记详情', '查看时间点和温度变化'], result: '每个温度和测量时间会一起显示，趋势只作记录参考。',
    actionLabel: '去记录体温', actionTo: '/health-events'
  },
  {
    id: 'prepare-online-consultation', title: '在线问诊前，怎么减少重复输入？', context: '健康随记已有内容时，可以从“下一步”进入在线问诊资料。',
    section: 'visit', filterIds: ['visit'], keywords: ['在线问诊', '复制全部', '复制病情', '资料', '医生'],
    steps: ['打开健康随记详情', '点“下一步”后进入在线问诊', '按需要复制单项或全部资料'], result: '已有病情描述可以直接带到问诊平台继续使用。',
    actionLabel: '去选择一条健康随记', actionTo: '/health-events'
  },
  {
    id: 'add-family-member', title: '想替孩子记录，先怎么添加家人？', context: '每位家人的健康随记和档案彼此分开。',
    section: 'family', filterIds: ['family'], keywords: ['孩子', '家人', '添加家人', '家庭成员', '替家人记录'],
    steps: ['进入“我的家人”', '点“添加家人”', '填写姓名、出生日期和性别'], result: '家人会出现在人物列表中，可以切换为当前记录对象。',
    actionLabel: '添加家人', actionTo: '/family'
  },
  {
    id: 'switch-family-member', title: '记录前，怎么确认写给了正确的人？', context: '健康随记页会显示当前家人，记录前可以先切换人物。',
    section: 'family', filterIds: ['family'], keywords: ['切换人物', '记录对象', '当前家人', '替家人记录'],
    steps: ['在健康随记页查看当前家人', '点“切换人物”', '选择要记录的家庭成员'], result: '之后新增的健康随记会归到选中的人物。',
    actionLabel: '管理家人', actionTo: '/family'
  },
  {
    id: 'record-allergy', title: '有明确过敏，应该记在哪里？', context: '过敏属于长期健康背景，不必混在某条健康随记里。',
    section: 'family', filterIds: ['family'], keywords: ['过敏', '不良反应', '药物过敏', '食物过敏', '档案'],
    steps: ['进入健康档案', '打开“过敏与不良反应”', '按已经知道的信息保存'], result: '过敏信息会留在当前家人的健康档案中，以后还可以继续补充。',
    actionLabel: '填写过敏信息', actionTo: '/health-profile/allergy'
  },
  {
    id: 'record-medication', title: '长期在吃的药，怎么留在档案里？', context: '长期用药可以单独维护，不需要一次填完所有字段。',
    section: 'family', filterIds: ['family'], keywords: ['长期用药', '药物', '剂量', '频率', '档案'],
    steps: ['进入健康档案', '打开“长期用药”', '填写已知的药名和用法'], result: '长期用药会归到当前家人的档案，之后可以继续完善。',
    actionLabel: '填写长期用药', actionTo: '/health-profile/medication'
  },
  {
    id: 'record-health-history', title: '慢性问题或手术经历，怎么慢慢补全？', context: '健康档案允许按需要逐项补充，不要求首次使用就填完整。',
    section: 'family', filterIds: ['family'], keywords: ['慢性病', '慢性问题', '手术史', '病史', '健康档案'],
    steps: ['进入健康档案', '选择慢性病史或手术史', '只填写当前已经确认的信息'], result: '保存后的长期背景可以随时回来更新。',
    actionLabel: '查看健康档案', actionTo: '/health-profile'
  }
]

export const guideTips = [
  '一句话可以同时包含人物、时间、症状和体温。',
  '第一次记录时可以把开始时间改成昨天或更早。',
  '同一条健康随记可以持续补充，不必重复新建。',
  '自动整理不准确时，可以在确认前返回修改。',
  '切换当前家人后，新记录会归到对应人物。',
  '健康档案不要求一次填完，已知多少就先记多少。'
]

function normalizeGuideText(value: string) {
  return value.toLocaleLowerCase('zh-CN').replace(/[\s，。！？、,.!?：:；;“”'"（）()\-_/]+/g, '')
}

export function searchGuideTutorials(query: string, filter: GuideFilterId = 'all') {
  const normalizedQuery = normalizeGuideText(query)
  return guideTutorials.filter((tutorial) => {
    if (filter !== 'all' && !tutorial.filterIds.includes(filter)) return false
    if (!normalizedQuery) return true
    const searchable = normalizeGuideText([tutorial.title, tutorial.context, tutorial.result, ...tutorial.keywords, ...tutorial.steps].join(' '))
    return searchable.includes(normalizedQuery)
      || tutorial.keywords.some((keyword) => {
        const normalizedKeyword = normalizeGuideText(keyword)
        return normalizedKeyword.length >= 2 && normalizedQuery.includes(normalizedKeyword)
      })
  })
}

export function getGuideTutorial(id: string | null) {
  return guideTutorials.find((tutorial) => tutorial.id === id) ?? null
}
