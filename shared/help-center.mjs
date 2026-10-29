import { isProductPathVisible } from './product-visibility.mjs'

// One public knowledge source for the page, search and AI help.
// Only describe capabilities available in the current test release.
const article = (id, title, summary, steps, extra = {}) => ({
  id, title, summary, conclusion: summary, steps,
  category: '健康随记', module: 'record', kind: 'tutorial',
  keywords: [], aliases: [], updatedAt: '2026-10-30', status: 'published', priority: 60,
  ...extra,
})
const action = (label, to) => ({ label, to })
const recordActions = [action('去健康日历', '/health-events')]
const visitActions = [action('打开就诊情况单', '/visit-summary')]
const accountActions = [action('查看账户与安全', '/account/security')]

const tutorials = [
  article('symptom', '手动记一件发生的事', '直接填写情况和时间就能记，照片和语音都不是必需的。', [
    '确认当前孩子，打开“记录症状”。从首页进入时，先切换键盘输入，再选择“记录症状”；也可以用下方按钮直接开始。',
    '用自己的话填写情况描述，按需补充身体部位和其他信息。附件选填，不需要每天拍照。',
    '核对实际发生时间，点右上角“保存”。失败时保留输入，按提示重试。',
    '保存成功后查看这条记录。以后可在健康日历按发生日期找到，打开后修改或继续补充。',
  ], { lesson: 'symptom', keywords: ['手动', '填写', '不想拍照', '不想说话', '事件', '第一条记录'], aliases: ['怎么手动记录', '只打字能记吗', '不拍照可以记录吗'], result: '一条归属当前孩子的真实记录，可在健康日历重新打开。', actions: recordActions, relatedArticleIds: ['sleep', 'find', 'save'] }),
  article('sleep', '记一次睡眠', '填写实际入睡和醒来的日期、时间，护护会计算这一段的时长。', [
    '确认当前孩子，从首页切换键盘输入，选择“记录日常”里的“睡眠”；也可以用下方按钮开始。',
    '首次可以先补记一段已经结束的睡眠。按实际情况调整入睡和醒来时间，圆环拖动与时间输入任选一种。',
    '跨夜时检查两端日期，核对计算出的时长。睡眠感受按需填写，不要直接把示例或默认时间当作实际记录。',
    '保存后在健康日历对应日期打开这段睡眠，查看开始、结束和时长；写错时可编辑。',
  ], { lesson: 'sleep', keywords: ['睡眠', '睡觉', '跨夜', '入睡', '醒来', '时长', '补记'], aliases: ['怎么记睡眠', '昨晚睡觉怎么补'], result: '一段有实际时间和时长的睡眠记录。', actions: recordActions, relatedArticleIds: ['daily', 'change-record-time', 'find'] }),
  article('daily', '记录喂养、饮食和排便', '日常情况可以手动填写，按本次实际发生的内容记录。', [
    '确认当前孩子，在首页切换键盘输入，点“记录日常”。',
    '选择喂养与饮食或排便，填写这次的实际情况。不同项目会显示相应字段。',
    '检查发生时间和已填写的内容后保存。不清楚的内容先不填，未记录不等于没有发生。',
    '到健康日历对应日期查看，打开记录可以核对或修改。',
  ], { keywords: ['喂养', '饮食', '奶', '辅食', '排便', '日常'], actions: recordActions, result: '记录按孩子和实际发生时间归入健康日历。', relatedArticleIds: ['sleep', 'find'] }),
  article('medication', '记录一次用药', '把实际用过的药和使用情况留下，方便以后核对。', [
    '确认当前孩子，在首页切换键盘输入，选择“记录用药”。',
    '填写已知药名、实际用药情况及发生时间，不清楚的剂量不要猜测。',
    '核对后保存，再到健康日历打开这条用药记录。',
  ], { keywords: ['用药', '吃药', '药名', '药物'], actions: recordActions, relatedArticleIds: ['find', 'no-diagnosis'] }),
  article('smart', '用语音或图片补充情况', '想说时可以说，有相关图片也可以添加；先核对整理结果，再确认保存。', [
    '确认首页当前孩子。按住说话，说完松开；也可以切换键盘直接输入。',
    '需要附件时使用图片入口选择相关材料。上传和处理中保留已有内容。',
    '检查实际转写文字、发生时间、数字和整理结果，发现错误先更正或补充。',
    '点“确认整理”后等待保存结果；显示已保存，再打开记录核对。仅发出消息不等于正式记录已保存。',
  ], { keywords: ['语音', '录音', '图片', '智能记录', '转写', '拍照'], aliases: ['怎么语音记录', '怎么上传图片'], actions: [action('回首页记录', '/nurse-station')], relatedArticleIds: ['mic', 'upload', 'recognition', 'save'], result: '正式保存的记录可从当前孩子的健康日历找到。' }),
  article('add', '添加和切换孩子', '先确认记录属于谁，孩子之间的记录和档案分别保存。', [
    '打开当前孩子的资料或切换入口，需要时选择“添加孩子”。',
    '填写孩子的基本信息并保存。',
    '选择本次要记录的孩子，开始记录前核对姓名。切换后再查看相应日历和档案。',
  ], { module: 'family', category: '家庭成员', keywords: ['添加', '宝宝', '家人', '成员', '切换', '孩子'], actions: [action('去添加孩子', '/family/new')], relatedArticleIds: ['profile', 'change-record-member'] }),
  article('profile', '补充孩子档案和已有资料', '长期背景放进孩子档案，日常发生的变化继续记录在健康日历。', [
    '确认当前孩子，打开底部“孩子档案”。',
    '按内容查看身份与出生背景、生长记录、过敏史、慢性病史、家族史、手术史、儿保与筛查或疫苗接种记录。',
    '已有图片或 PDF 可点“上传资料”，选择后“开始整理”。核对日期、识别字段、来源及归档位置。',
    '修改不准确的内容，再点“保存到档案”；回到相应条目核对。',
  ], { module: 'family', category: '健康档案', keywords: ['档案', '病史', '检查单', '上传资料', 'PDF', '疫苗', '儿保'], actions: [action('打开孩子档案', '/health-profile')], relatedArticleIds: ['growth', 'allergy', 'upload'] }),
  article('growth', '记录和修改身高体重', '按实际测量日期保存身高、体重，之后可以查看曲线和历史测量。', [
    '打开“孩子档案”的“生长记录”，进入成长数据。',
    '填写本次身高、体重，核对后点“保存本次更新”。',
    '补记以往测量时，打开“记录列表”，点“添加”，填写实际测量日期后“保存记录”。',
    '历史测量可编辑或删除；曲线和解读以已经录入的数据为依据。',
  ], { module: 'family', category: '健康档案', keywords: ['身高', '体重', '生长', '成长', '测量', '曲线'], actions: [action('打开成长数据', '/health-profile/basic')], relatedArticleIds: ['profile', 'review'] }),
  article('allergy', '查看和补充过敏史', '记录已经知道的过敏情况与确认来源，不确定的内容保留待核对状态。', [
    '确认当前孩子，进入“孩子档案”的“过敏史”。',
    '查看已有条目，补充已知对象、反应和确认来源。',
    '保存后重新打开核对。没有填写过敏史，不表示已确认没有过敏。',
  ], { module: 'family', category: '健康档案', keywords: ['过敏', '来源', '反应', '过敏史'], actions: [action('打开过敏史', '/health-profile/allergy')], relatedArticleIds: ['profile'] }),
  article('summary', '整理一份就诊情况单', '把已记录的情况和档案整理在一起，让阅读的人先看重点，需要时再展开细节。', [
    '确认当前孩子，点底部“一键整理”，选择“就诊情况单”。',
    '查看“目前情况”中的情况描述与关键词，核对本次关注的情况。',
    '按需展开“相关经过与处理”“完整资料档案”等内容，或用“目录”定位章节。',
    '核对资料范围和截至时间，需要时修改内容，再选择导出或复制。',
  ], { module: 'visit', category: '就医准备', keywords: ['情况单', '整理', '概述', '关键词', '医生', '就诊'], actions: visitActions, relatedArticleIds: ['html', 'prompt', 'export-data'] }),
  article('prompt', '复制文字给其他 AI', '复制整理后的文字重点，到你使用的 AI 中自行粘贴，减少重复输入。', [
    '打开就诊情况单，先核对当前孩子、本次情况和资料范围。',
    '点“导出”，选择“复制给 AI 继续提问”；只需要文字时可选“复制文字内容”。',
    '到你使用的 AI 中粘贴。若浏览器不允许自动复制，按页面展示的文字手动选择复制。',
    '复制内容是整理后的文字重点，不携带照片、视频原件，也不会自动发送给外部 AI。',
  ], { module: 'visit', category: '就医准备', keywords: ['AI', '提示词', '问诊', '复制', '粘贴'], actions: visitActions, relatedArticleIds: ['html', 'export-data'] }),
  article('html', '保存情况单，带去就诊', '保存一份导出时的情况单文件，方便在浏览器中打开给医生阅读。', [
    '打开就诊情况单并核对内容，点“导出”。',
    '选择“保存情况单，带去就诊”，核对当前资料范围和准备附带的影像原件。',
    '下载完成后，在浏览器下载列表或手机文件中找到情况单 HTML 文件，用浏览器打开检查。',
    '文件保存的是导出时的快照。影像以选中并成功附带的原件为准；只有附件索引时不代表已经带上原件。',
    '资料变化或原件未成功附带时，按提示重新核对、重试或调整选择。',
  ], { module: 'visit', category: '就医准备', keywords: ['保存', 'HTML', '下载', '情况单', '医生', '离线', '原件'], actions: visitActions, relatedArticleIds: ['prompt', 'export-data'] }),
  article('review', '回看近期情况和变化', '把同一个孩子一段时间内的实际记录放在一起回看。', [
    '点“一键整理”，进入“近期情况回顾”。',
    '选择7天、30天、半年、一年，或自定义日期后点“应用”。',
    '用“图表总览”查看变化，用“记录对照”按日核对；在“记录明细”中可“查看原始记录”。',
    '需要带走时点“保存图表回顾”，保存为本地 HTML 文件。',
    '回顾只依据已有记录；“暂无记录”不表示没有发生，也不代表医学结论。',
  ], { module: 'visit', category: '记录与时间线', keywords: ['回顾', '近期', '变化', '统计', '趋势', '图表', '对照'], actions: [action('打开近期情况回顾', '/recent-review')], relatedArticleIds: ['find', 'growth'] }),
]

const faqs = [
  article('find', '保存后找不到记录怎么办？', '先核对账号、孩子和发生日期，再查看是否仍在原页面的草稿中。', ['确认登录的是保存时的账号，当前孩子也一致。', '打开健康日历，查看实际发生日期，清除不需要的分类或搜索筛选。', '如果当时没有保存成功的提示，回到原页面检查草稿；已有输入先保留。', '仍找不到时，通过反馈说明页面、日期和当时看到的提示。'], { keywords: ['找不到', '不见了', '没了', '更新', '旧记录'], aliases: ['我的记录不见了'], actions: recordActions }),
  article('save', '保存失败，已经写的内容怎么办？', '先保留当前输入，在原页面按提示重试，收到保存结果后再核对记录。', ['先不要清空表单或重复新建同一件事。', '检查网络与页面提示，使用页面的“重试”或保存操作。', '保存成功后打开实际记录，核对孩子、内容和时间。', '仍失败时到反馈说明具体页面和提示，不要发送密码或验证码。'], { keywords: ['保存失败', '没保存', '重试', '草稿'], actions: recordActions }),
  article('mic', '录音没反应或转写失败怎么办？', '根据卡住的阶段处理，也可以继续用文字完成记录。', ['按住说话没有反应时，检查当前网站或 App 的麦克风权限。', '录音已完成但转写失败时，先保留已有内容，按消息旁的“重试”操作，不必反复录同一段。', '转写文字不对时，在对话中用文字指出更正内容；整理不完整时继续补充，再核对记录。', '等待处理或发出消息不等于正式保存。可切换键盘填写，最终查看保存结果。'], { keywords: ['录音', '语音', '麦克风', '转写', '没反应', '超时'], actions: [action('回首页记录', '/nurse-station')], relatedArticleIds: ['recognition', 'symptom', 'save'] }),
  article('recognition', '识别错了，或整理漏了怎么办？', '先核对实际文字，再更正整理结果，保存后查看最终记录。', ['如果转写文字有错，在对话中用文字指出姓名、时间、温度或药名等更正内容。', '如果文字正确但整理遗漏，直接补充缺少的情况或指出需要更正的地方。', '检查整理后的情况概述、关键词及展开内容，再确认整理。', '已有正式记录时打开详情编辑，保存修改后重新核对。'], { keywords: ['识别错', '漏了', '整理', '纠正', '不准确', '听错'], actions: [action('回首页核对', '/nurse-station')], relatedArticleIds: ['mic', 'find'] }),
  article('upload', '图片上传或识别失败怎么办？', '上传附件和识别资料是不同操作，先看当前页面提供的功能。', ['手动“记录症状”的附件只保留照片或视频缩略图，不自动解析内容。', '需要把已有材料整理进档案时，去“孩子档案”使用“上传资料”，核对识别结果后保存。', '上传失败时保留文字，检查网络和页面提示后重试；材料应清晰、完整。'], { keywords: ['图片', '上传', '照片', '识别', '附件'], actions: [action('打开孩子档案', '/health-profile')], relatedArticleIds: ['profile', 'attachment-upload-failed'] }),
  article('attachment-upload-failed', '为什么附件上传失败？', '先保留已填写内容，检查页面提示后重试上传。', ['确认网络可用，查看是否有文件格式或大小提示。', '重新选择相同材料，等待缩略图或成功结果，不要重复保存多条记录。', '仍失败时通过反馈提供所在页面和提示；已有文字可以先继续核对。'], { category: '图片与附件', keywords: ['附件', '上传失败', '图片点了没反应'], aliases: ['图片点了没反应'], actions: recordActions }),
  article('change-record-time', '如何修改记录的时间？', '使用实际发生时间；过去的事情可以补记，未来时间不能作为已发生事实保存。', ['保存前直接修改表单中的发生时间。', '已保存时在健康日历打开记录，进入编辑，调整实际日期与时间后保存。', '睡眠需要同时核对入睡与醒来日期，跨夜时尤其注意。'], { keywords: ['时间', '日期', '补记', '修改'], aliases: ['时间写错'], actions: recordActions }),
  article('change-record-member', '如何修改记录所属的孩子？', '先确认记录属于谁；发现归属错误时打开原记录核对可修改的内容。', ['记录前先切换到正确孩子，避免把不同孩子的情况记在一起。', '已记错时打开原记录检查归属及编辑入口，保留原内容。', '当前页面无法修改所属孩子时，通过反馈说明情况，不要直接把原记录删掉后猜测恢复。'], { category: '家庭成员', keywords: ['孩子', '归属', '写错人'], aliases: ['我写错人了'], actions: recordActions }),
  article('delete-record', '如何修改或删除一条记录？', '从健康日历打开具体记录，再编辑或删除。', ['核对当前孩子和发生日期，打开要处理的记录。', '选择编辑并保存修改；需要删除时核对内容并按确认提示操作。', '删除对话与删除正式记录是两件事。侧栏删除对话不会删除已经保存的记录。'], { keywords: ['修改', '删除', '写错', '对话'], actions: recordActions }),
  article('delete-health-event', '如何处理一件事中的记录？', '先从健康日历打开实际记录，核对后再修改或删除。', ['确认孩子与日期，找到对应记录。', '进入详情核对内容，再使用编辑或删除操作。', '需要处理多条内容时逐条核对，避免误删其他情况。'], { keywords: ['事件', '删除健康随记'], actions: recordActions }),
  article('export-data', '如何导出我的记录和资料？', '先核对情况单范围，再选择保存文件或复制文字；两种方式携带的内容不同。', ['进入“一键整理”的“就诊情况单”，核对孩子、资料范围和截至时间。', '带去就诊可用“保存情况单，带去就诊”，按需附带原件。', '给其他 AI 可用“复制给 AI 继续提问”，自行粘贴整理后的文字。', '打开导出的文件检查内容。文字摘要、资料索引和实际附带的影像原件分别核对。'], { category: '数据与隐私', keywords: ['导出', '下载', '数据', '备份', '拿出来'], aliases: ['怎么把数据拿出来', '怎么把数据导出'], priority: 90, actions: visitActions, relatedArticleIds: ['html', 'prompt'] }),
  article('account-basics', '不绑定手机号或邮箱，也能用吗？', '用昵称和密码注册后就能记录，手机号与邮箱由你选择是否绑定。注册不要求添加支付方式。', ['妥善保管注册昵称和密码，用同一账号查看已经保存的记录。', '需要绑定时从侧栏“我的账户”进入“账户与安全”，选择当前提供的手机号或邮箱入口。', '绑定邮箱可增加一种验证身份的方式；未绑定且忘记密码时，当前自助找回方式有限，可通过反馈寻求帮助。'], { module: 'account', category: '账号与登录', keywords: ['昵称', '密码', '注册', '登录', '绑定', '手机号', '邮箱', '支付', '扣费'], actions: accountActions }),
  article('email-code-missing', '为什么收不到邮箱验证码？', '检查邮箱地址、垃圾邮件和发送结果，再按页面提示重试。', ['核对邮箱拼写与当前操作的用途。', '查看垃圾邮件、广告邮件等分类，并等待页面允许重新发送。', '仍未收到时记录页面提示，通过反馈说明。不要把验证码发给使用助手。'], { module: 'account', category: '账号与登录', keywords: ['邮箱验证码', '收不到', '邮件'], aliases: ['邮箱那个码一直没来', 'EMAIL 验证码 没收到'], priority: 90, actions: accountActions }),
  article('email-code-expired', '验证码显示已过期怎么办？', '重新获取当前操作的验证码，使用最新的一封。', ['回到发送验证码的页面，按提示重新获取。', '保持邮箱与操作用途一致，输入最新验证码。'], { module: 'account', category: '账号与登录', keywords: ['验证码', '过期'], actions: accountActions }),
  article('change-login-email', '如何修改绑定邮箱？', '从账户与安全进入邮箱，按页面验证后保存。', ['打开“账户与安全”的邮箱入口。', '按页面要求完成身份验证，输入新邮箱并核对。', '保存成功后回账户与安全查看。'], { module: 'account', category: '账号与登录', keywords: ['邮箱', '修改', '绑定'], actions: accountActions }),
  article('privacy-data', '权限和记录有什么关系？', '麦克风、相机和文件权限用于你主动选择的输入方式；手动填写不需要这些权限。', ['按住说话时按需允许麦克风；拍摄和选择材料时按需使用对应权限。', '不想使用语音或拍照，可以直接手动填写。', '管理已授权项目时，到隐私设置或设备系统设置查看。'], { category: '数据与隐私', keywords: ['权限', '隐私', '相机', '麦克风'], actions: [action('查看隐私设置', '/settings/privacy')], relatedArticleIds: ['symptom', 'account-basics'] }),
  article('delete-data', '如何删除记录或注销账户？', '单条记录可在详情中删除；注销账户是另一项操作，需要按账户页面完成验证和确认。', ['只删除一条记录时，从健康日历打开该记录，核对后删除。', '注销账户时进入“账户与安全”，按“删除账户”的验证与确认步骤操作。', '未绑定可用验证方式或无法继续时，通过反馈说明情况。不要把删除对话当作删除全部资料。'], { category: '数据与隐私', keywords: ['删除', '注销', '账户', '数据'], actions: accountActions }),
  article('page-load-failed', '页面加载失败或一直空白怎么办？', '先保留当前输入，检查网络并按页面提示重试。', ['已有输入先保留，不要先清除网站数据或反复刷新。', '查看网络与页面错误提示；可返回后重新进入。', '仍无法打开时通过反馈提供页面名称、提示和使用的设备。'], { keywords: ['空白', '打不开', '加载失败'], actions: [action('反馈使用问题', '/feedback?category=故障排查&page=帮助中心')] }),
  article('browser-compatibility', '网页和 App 的操作一样吗？', '记录、日历、档案与整理的主要流程一致，拍摄和选取材料的系统菜单可能不同。', ['以当前页面实际显示的入口为准。', '浏览器与 App 的权限分别在系统或浏览器中管理。', '某种输入方式不可用时，可以先手动填写并保留情况。'], { keywords: ['浏览器', 'App', '兼容', '手机'], actions: [action('打开使用教程', '/help')] }),
  article('no-diagnosis', '护护会给出医疗诊断吗？', '护护帮助记录和整理实际情况，不提供医疗诊断，也不代替专业人员判断。', ['把已发生的情况、变化和处理措施按实际记录。', '需要就诊时整理情况单，供专业人员了解。'], { keywords: ['诊断', '医生', '用途'], actions: visitActions }),
].map(item => ({ ...item, kind: 'faq', module: item.module === 'record' ? 'trouble' : item.module }))

const product = [
  article('record-modes', '怎么方便，怎么记', '手动填写、语音和相关图片各有用途，你可以按当时方便的方式选择。', ['基础情况可以直接手动填写，不要求每天拍照。', '睡眠、喂养、排便等日常内容有相应表单。', '想说话时再用语音；有材料时再添加，并核对识别结果。'], { helpArticleId: 'symptom', keywords: ['便利', '手动', '语音', '拍照'] }),
  article('long-memory', '慢慢记，长期回看', '已保存的记录按孩子持续积累，方便以后查找、补充和再次整理。', ['正式记录与当前对话、未保存输入有不同状态，保存后可到健康日历核对。', '用同一账号、选择同一个孩子，按日期找到历史记录。版本更新后也从原账号和孩子继续查看。', '整理时核对资料范围。重点摘要供快速阅读，详细资料和原始依据按需展开。'], { helpArticleId: 'find', keywords: ['长期', '记忆', '历史', '保存', '积累'] }),
  article('product-purpose', '把情况整理好，需要时带出去', '护护帮助你记录、整理孩子的情况，让医生或其他阅读者更快理解重点。', ['日常留下真实情况，长期背景放进孩子档案。', '就诊情况单先呈现当前重点，需要时查看经过、档案和原始依据。', '根据用途保存情况单文件，或复制整理后的文字到自己使用的 AI。导出前核对对象和范围。'], { helpArticleId: 'summary', keywords: ['目标', '用途', '医生', '导出', 'AI'] }),
  article('own-changes', '从自己的记录中看见变化', '近期情况回顾把同一个孩子一段时间内的记录放在一起，方便回看和核对。', ['按所选日期查看图表和每日记录对照。', '有疑问时打开原始记录，核对数据来自哪里。', '回顾以已有记录为依据；数据不足时保留空缺，不把没有记录解释成没有发生。'], { helpArticleId: 'review', keywords: ['总结', '回顾', '变化', '分析'] }),
  article('audience', '先把儿童照护记录做好', '护护目前优先服务 0—6 岁儿童，也就是未满 7 周岁的日常照护记录。', ['围绕孩子的情况记录、档案整理和资料导出提供当前功能。', '孩子逐渐长大，已保存资料仍按原有孩子归属回看。'], { helpArticleId: 'add', keywords: ['年龄', '人群', '儿童', '六岁', '七岁'] }),
  article('account-choice', '昵称注册，绑定由你选择', '昵称和密码即可开始使用，注册不要求添加支付方式。', ['手机号和邮箱绑定按你的选择进行，不作为开始记录的条件，也不改变已保存记录的账号归属。', '妥善保管账号信息，用同一账号继续查看记录。', '找回密码和注销按账户页面提供的验证方式操作，遇到困难可反馈。'], { helpArticleId: 'account-basics', keywords: ['账号', '昵称', '绑定', '支付'] }),
].map(item => ({ ...item, kind: 'product', module: 'product', category: '数据与隐私' }))

const visible = item => (item.actions ?? []).every(a => isProductPathVisible(a.to))
export const SUPPORT_ARTICLES = [...tutorials, ...product].filter(visible)
export const EXTRA_ARTICLES = faqs.filter(visible)
export const USER_MANUAL = product.map(item => ({
  id: ({ 'record-modes': 'smart' })[item.id] ?? item.id,
  title: item.title, brief: item.summary, purpose: item.steps[0], scene: item.steps[1] ?? '',
  example: item.steps[2] ?? '', output: item.summary, module: 'product', category: item.category,
  helpArticleId: item.helpArticleId, articleId: item.id,
}))
export const HELP_MODULES = [
  { id: 'record', label: '手动与日常记录', description: '先记一件事，再记好每天的情况', articleIds: ['symptom', 'sleep', 'daily', 'medication', 'smart'] },
  { id: 'family', label: '孩子与档案', description: '确认对象，补充长期背景', articleIds: ['add', 'profile', 'growth', 'allergy'] },
  { id: 'visit', label: '查找、回顾与导出', description: '找回原记录，整理后带走', articleIds: ['find', 'review', 'summary', 'html', 'prompt'] },
  { id: 'account', label: '账号与权限', description: '昵称登录，按需绑定和授权', articleIds: ['account-basics', 'email-code-missing', 'privacy-data', 'delete-data'] },
  { id: 'trouble', label: '使用中遇到问题', description: '保留输入，找到下一步', articleIds: ['mic', 'recognition', 'upload', 'save', 'page-load-failed'] },
  { id: 'product', label: '产品说明', description: '了解记录的用途和使用原则', articleIds: product.map(item => item.id) },
]
