export interface HelpPageStep { title: string; description: string; targets: string[]; click?: boolean; input?: boolean; interactionTarget?: string }
export interface HelpPageTour { path: string; paths: string[]; steps: HelpPageStep[] }
const step = (title: string, description: string, targets: string[], click = false, input = false): HelpPageStep => ({ title, description, targets, click, input })
const exportSteps = (file: boolean): HelpPageStep[] => [
  step('先核对情况单，再打开导出', '确认孩子和资料范围。这里只会打开导出选项，不会自动把资料发送到其他地方。', ['button[aria-label="导出情况单"]'], true),
  step(file ? '保存情况单文件，方便带去就诊' : '复制文字，去你使用的 AI 自行粘贴', file ? '点击原按钮后，留意页面的下载或错误提示，再到浏览器下载列表检查文件。图片原件以成功附带的内容为准。' : '可以复制给 AI 的文字，也可以只复制文字内容。页面会说明复制结果；不自动发送，也不携带照片视频原件。', file ? ['button[aria-label="保存情况单，带去就诊"]'] : ['button[aria-label="复制给 AI 继续提问"]','button[aria-label="复制文字内容"]'])
]
export const HELP_PAGE_TOURS: Record<string, HelpPageTour> = {
  find: { path:'/health-events', paths:['/health-events','/health-events/search'], steps:[step('点放大镜，查找已经保存的记录','先确认当前孩子。这个入口按你填写的关键词查找已有记录。',['button[aria-label="搜索健康日历"]'],true),step('输入你记得的关键词','例如实际记过的症状或事情。输入后等待查找，不需要提交一条新记录。',['.journal-search-field'],false,true),step('在这里查看实际查找结果','有结果时点开原记录；没有找到时，换关键词、检查孩子或日期。没有结果不代表没有发生。',['.journal-search-body'])] },
  profile: { path:'/health-profile',paths:['/health-profile'], steps:[step('按资料类别，选择要补充的内容','进入对应分类手动添加或编辑，核对日期、数值和孩子，再使用原页面的保存按钮。日常发生的变化仍记在健康日历。',['.health-profile-group:first-child .health-profile-entries'])] },
  growth: {path:'/health-profile/basic',paths:['/health-profile/basic'],steps:[step('点数值，填写实际测量结果','可以直接编辑身高或体重，也可以使用旁边的加减。这里的初始值需要核对，不会由教程自动保存。',['.growth-step-grid']),step('核对后，使用原来的保存按钮','保存是否成功以页面提示为准。历史测量可在记录列表查看；补记过去的测量时核对测量日期。',['.growth-update-save'])]},
  allergy: {path:'/health-profile/allergy',paths:['/health-profile/allergy'],steps:[step('点这里，新增一条已知过敏史','没有记录不表示没有过敏；不要为了完成教程随便添加。',['.inline-profile-add'],true),step('填写已经知道的过敏对象','只记录实际已知的信息。填写后点原表单的保存；失败时内容仍留在表单，按提示重试。',['form[aria-label="新增过敏史"]'])]},
  add:{path:'/nurse-station',paths:['/nurse-station','/family/new'],steps:[
    step('点这里，先确认当前孩子','已有孩子可以切换，需要新增时点列表里的“添加孩子”。首次使用可先退出引导，沿首页提示建档。',['button[aria-label="切换记录对象"]','button[aria-label="添加记录对象"]','.first-child-setup'],true),
    {...step('从孩子列表添加，或选择当前孩子','点“添加孩子”进入真实表单。只想切换时，选择已有孩子即可；切换后可从帮助中心重新打开操作引导。',['[role="dialog"][aria-label="我的孩子"]','.first-child-setup'],true),interactionTarget:'[data-help-target="child-add"]'},
    step('填写真实孩子信息，再保存','姓名、生日、性别和记录者关系按实际填写。点原表单的添加按钮；保存结果以页面提示为准，教程不自动创建孩子。',['[data-help-target="child-form"]','.first-child-setup'])
  ]},
  smart:{path:'/nurse-station',paths:['/nurse-station'],steps:[step('按住说，或切换文字输入','长按开始、松开结束；不方便说话可以点键盘。这里不会自动录音或发送内容。',['.hoho-dialogue-hold','button[aria-label="改用文字"]','textarea[aria-label="对话输入"]']),step('先核对文字，再确认整理','可以切换文字填写或更正。发送后核对实际文字、概述、关键词和时间；正式记录以“确认整理”后的保存结果为准。',['.hoho-dialogue-composer'])]},
  summary:{path:'/visit-summary',paths:['/visit-summary'],steps:[step('点开目前情况，先看概述和关键词','情况概述和关键词帮助快速理解；更完整的经过与档案按需展开。加载失败时先退出引导，使用页面的重试。',['[data-reading-card="overview"] .visit-reading-toggle']),step('用目录定位需要的章节','点击目录查看各个章节，再回到实际内容核对。情况单只根据已有记录整理。',['button[aria-label="章节目录"]']),step('需要带走时，打开导出','可以保存情况单文件，或复制整理后的文字。具体结果以原页面提示为准。',['button[aria-label="导出情况单"]'])]},
  prompt:{path:'/visit-summary',paths:['/visit-summary'],steps:exportSteps(false)},
  html:{path:'/visit-summary',paths:['/visit-summary'],steps:exportSteps(true)},
  review:{path:'/recent-review',paths:['/recent-review'],steps:[step('先选择想回看的时间范围','选择7天、30天等范围，或使用自定义日期。回顾只统计已录入的记录。',['.review-controls']),step('图表看变化，对照看每天的情况','切换这两个栏目查看。需要核对细节时，在下方打开原始记录；没有记录的地方保留空缺。',['.review-view-tabs'])]}
}
const aliases: Record<string,string> = { mic:'smart', recognition:'smart', 'change-record-member':'add', 'change-record-time':'find', 'delete-record':'find', 'delete-health-event':'find', 'export-data':'html' }
export function helpTourUrl(articleId: string) {
  const id = aliases[articleId] ?? articleId, tour = HELP_PAGE_TOURS[id]
  return tour ? tour.path + '?helpTour=' + id : null
}
