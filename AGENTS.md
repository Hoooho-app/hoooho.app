## 用量监控与侧栏：产品主人确认 2026-11-04

- 用户侧栏帮助/反馈/关于上移，对话记录居中，账户与记录对象在底部，个人用量在最下方。保留隐私遮罩、账户/对象独立入口及已有装饰。容量是按账户归属的资料估算，AI 是启用后供应商真实 usage 回执；未知、部分覆盖及读取失败不可补零。账户切换不串用量。
- 控制台资源监控在板块内部按项目查看：磁盘实测、文件分类、增长及 AI 消耗。容量告警只进入 Overview，实际打开并定位才确认已查看；全站盘预警不能作为个人欠费或订阅依据。
- 套餐价格/额度是管理员建议稿，当前未启用付费、自动扩容或新限流；不能把建议额度显示成已有订阅或放置假支付入口。原件是否省略仍是讨论问题，本轮不删除原件。契约及验收见 `docs/delivery/usage-monitoring-20261104.md`。

## 产品运营埋点：产品主人纠正并确认 2026-11-02

- 本次覆盖下方“产品卖点工作稿”的旧理解。原 `/ops/marketing` 和侧栏“产品运营”直接替换为护护用户行为统计：总览、全页面、功能使用、访问路径和关键流程。其他项目显示未接入，不再铺卖点文案。
- 每个实际开放路由及操作入口必须纳入；零访问/零点击保留，隐藏、暂无回执和读取错误分开。访问、点击与真实成功回执分别计数，不将AI草稿、排队或下载发起冒称正式保存或文件已落盘。
- 仅采集静态页面/控件与操作状态元数据，不上传输入原文、健康内容、录音照片、搜索词、实际记录ID或分享令牌。正式用户与内部验证分开；离线补报和多标签页不得相互覆盖，重发幂等。
- 只改此统计链路，保留其他后台、健康业务和数据。契约及发布证据见 `docs/delivery/product-analytics-20261102.md`。

## 产品运营：产品主人确认 2026-11-01（旧卖点理解，已被上方覆盖）

- 总控台侧栏新增“产品运营”，项目切换仍在板块内。本轮只铺护护记录当前可见前端的定位、卖点与建议文案，其他项目暂不建设，不推断其商店状态。
- 运营资料为工作稿，版本化保存；首版可分类、搜索、核对原页面并复制。子流程归并到可进入父页，不虚构记录ID、诊疗效果、上架认证、用户规模或隐藏能力。页面可见性沿用产品开关，产品前台与健康数据不变。契约见`docs/delivery/ops-product-marketing-20261101.md`。

## 平台授权窗口操作：产品主人反馈 2026-11-01

- 总控台发布须覆盖已有PWA旧壳升级；`/ops`导航不走离线壳，旧缓存恢复使用同标签`/api/console-entry`网络入口。保留账号、业务缓存和本机草稿，不用清站点数据代替修复；需实际旧SW复现并验证新版frame与原位输入。
- 各平台共用窗口须支持截图点选后原位直接输入、粘贴、中文组合输入和Tab/Enter；不能把能展示截图当成能完成登录。普通完整案例须实际走点击→输入→切换→提交→读取→核对保存，不能只使用已登录账单图验证。
- 当前焦点元信息仅标签/类型/矩形/是否有值，绝不回传输入内容；编辑按会话、页面与控件身份串行写入，未同步不得跳过提交，焦点变化和迟到画面不得串入其他字段。本人账号凭据不入聊天、日志或本地持久化。
- 改动与发布回执见 `docs/delivery/ops-billing-live-fields-20261101.md` 的“平台窗口直接输入修复”。

## 费用真实字段与用途分类：产品主人确认 2026-11-01

- 费用必须按用途分类（服务器与存储、运营管理、AI 与 Agent、域名与发布、其他），并单独保存可多选计费方式（按量、存储、订阅、续费、预付费）；保留项目归属、图片与历史。
- 各平台展示实际适用字段，域名不挂余额/额度空模板。余额0、附赠额度耗尽、结算周期和下次扣款不能混同欠费/停服；只有明确证据才判定。未授权与字段缺失要区分。
- 通过控制台“连接采集”提供可用授权窗口，本人同意后登录、核对字段和隐私预览，再保存并自动重读。不能只交付缺服务器变量的说明。私有采集服务与健康应用隔离，独立卷/凭据；不复制本机Cookie、不开放CDP，不代本人勾选持续授权或登录。契约见 `docs/delivery/ops-billing-live-fields-20261101.md`。

## 总控台自动采集与模块补全：产品主人确认 2026-11-01

- 本次明确覆盖此前“服务链接/版本管理/设置留白”：按当前控制台格式补全；服务只显示受控健康端点实测结果，版本只显示运行实例提供的提交/回执，未接入项目与原生渠道不伪造版本或在线数据。
- 费用以后台自动采集为主，不能要求日常手动上传。账单区域截图与字段读取须已有服务端专用持续授权、区域及隐私遮罩；缺失显示待授权，不复制本机Cookie或绕过验证。域名到期可使用官方公开RDAP，不能当作扣款日期。
- 费用状态与截图更新分开，日期/余额/额度未知或过期不显示全项正常；临期及不足进入Overview，原查看回执规则保留。提醒阈值服务端持久化，仅站内，不擅自邮件/短信或付款。契约见 docs/delivery/ops-automation-20261101.md。

## 总控台版式：产品主人确认 2026-11-01

- `/ops` 为 Overview 新情况收件箱，费用面板移到 `/ops/billing` 并保留既有快照能力。侧栏为 Overview、费用监控、反馈中心、服务链接、版本管理；顶栏仅账户与退出，项目在板块内部切换。服务链接、版本管理未建设时为空，不虚构在线数据；无独立告警日志菜单。
- Overview 红色数量仅用于本运营控制台；不恢复健康产品已删除的新记录红点。只从已接入的真实反馈与费用变化生成动态，预览不确认查看，成功打开并定位源内容后保存回执；跨日未查看保留，新版本动态不能被旧回执清除。其他项目未接入时为空，旧费用来源仍属于原护护记录，归属改动须显式保存。
- 布局使用剩余全宽，支持带鱼屏与笔记本，不把固定宽度画稿等比缩小。契约和实际发布证据见 `docs/delivery/ops-console-layout-20261101.md`。

# Hoooho execution and design standards

## 首页轮播节奏微调：产品主人确认 2026-10-30

- 三张横幅完整停留统一改6秒，仍使用原560ms覆盖/560ms浮现马赛克。就诊场景图稍放大并向右靠，保留完整人物/手机气泡、原文案和其他两张；输入/聚焦/后台暂停、失败跳过、首气泡卸载不变。本段覆盖旧10秒规则。见 `docs/delivery/frontdesk-six-second-20261030.md`。

## 首页就诊交接场景：产品主人确认 2026-10-30

- 第二张横幅采用已确认的3D交接场景：妈妈背面举手机、医生正面做OK手势，手机浮出包含情况单的小气泡；删除后方档案堆，夹子无AI标识。此段覆盖上一版档案合成配图，仅更换该张素材及说明，不改文案、布局、三张10秒停留、马赛克或业务。见 `docs/delivery/frontdesk-doctor-handoff-20261030.md`。

## 档案手动编辑优先：产品主人确认 2026-10-30

- 孩子档案顶栏仅菜单与首页同款孩子信息，移除智能资料上传及首页照片/视频/文件入口；保留文字/录音、手动表单附件、既有资料及对话原件。档案目录三张分类卡复用记录卡阴影，生长记录用向上折线trending_up。见 `docs/delivery/archive-manual-polish-20261030.md`。

## 首页档案合成横幅：产品主人确认 2026-10-30

- 就诊张改“一键整理，一次说清。”，采用已确认的完整档案汇集成体面情况单的合成图，夹子去AI字样；正常屏上文下图，短屏紧凑双列，真实HTML文字与完整图片适配同一区域。
- 三张停留统一由8秒加至10秒；马赛克、输入／后台／聚焦暂停、资源失败跳过及首气泡卸载规则保留，其他两张与其他业务冻结。见 `docs/delivery/frontdesk-dossier-banner-20261030.md`。本段覆盖旧标题／配图与8秒局部规则。


## 首页留白：产品主人确认 2026-10-30

- 空白对话首页，顶栏到横幅、横幅到双卡、双卡之间、双卡到输入栏、左右页面边距统一16px；以当前内容为准，不恢复截图旧版功能。保留窄/矮屏完整图片、输入可达和首消息后卸载。见 `docs/delivery/home-equal-spacing-20261030.md`。

## 对话圆气泡：产品主人确认 2026-10-30

- 侧栏历史使用单个圆气泡，新建使用同一圆气泡内加号；首页放大镜右侧提供相同的新建入口，复用原流程和忙碌禁用。按明确圆形要求，共享 `ConversationBubble` 两个变体为此语义的局部例外，沿用细线、单色，其他 Material 图标不变。

## 首页就诊情况单横幅：产品主人确认 2026-10-30

- 在“今天怎么样？”和“记忆很长，不会忘。”之间新增就诊情况单介绍。文案／配图由执行者设计为“一键成单，一次说清。”和“问医生、问 AI，不用从头讲。”，以零散笔记汇成一张3D情况单表达产品核心价值；既有两张内容保留。
- 三张依次8秒停留并以原马赛克循环；无可见控件，输入／聚焦／后台暂停、首条气泡整体卸载等规则保留。资源独立预加载，失败张跳过，不阻塞其他可用张。仅新增介绍，不改情况单生成、AI、导出与数据能力。见 `docs/delivery/frontdesk-visit-banner-20261030.md`。本段覆盖此前两张轮换的局部约定。


## 帮助中心：产品主人确认 2026-10-30

- 三栏目为使用教程、产品说明、常见问题；手动记录与睡眠优先，带用户完成真实保存和查看结果。语音、图片为可选方式。
- 只说明当前测试版已开放功能。隐藏功能、任务系统及未来规划不进入页面、检索、旧链接推荐或AI知识；不以说明改版恢复业务入口。
- 教程按账户/孩子隔离，完成以真实保存回执为依据；失败、中断和返回可继续，示例不自动写健康数据。既有记录、账号、导出和任务业务协议不改。契约见 `docs/delivery/help-center-redesign-20261030.md`。
## 首页记忆档案表达：产品主人确认 2026-10-30

- 第二张横幅标题为“记忆很长，不会忘。”；副标题“记录再多，细节也能回头找到。”。配图为同风格3D的大体量密集文件档案，强调积累的规模与细节可查；标题与副标题左侧连排、档案右侧靠拢，覆盖旧“慢慢记”及分散的图左字右版式。
- 这是本次横幅文案与视觉调整，底层模型上下文／检索／存储能力不变，不推导无限上下文或自动读取全部历史的技术承诺。轮播时序、无可见控件、输入暂停与首条气泡后卸载维持。见 `docs/delivery/frontdesk-deep-memory-20261030.md`。


## 症状图标统一：产品主人确认 2026-10-30

- 症状描述、症状记录导航与分类、症状跟进及症状记录卡统一使用同库 `health_cross` 医疗十字，默认空心、实际选中沿用实心规则；统一从 `SymptomIcon` / `SYMPTOM_ICON_NAME` 读取。此段覆盖此前症状使用方框加号、听诊器或波形的局部图标。
- 使用固定 Material Rounded 300 原图，不改布局、文字或业务；部位定位、就诊、用药等独立语义保留原图标。见 `docs/delivery/symptom-icon-unification-20261030.md`。

## 侧栏对话：产品主人确认 2026-10-30

- 点历史对话直接在首页恢复原对话并可继续，移除独立的“对话记录”列表/详情页；旧链接兼容跳回首页。切换先保留当前未发送输入和原件，不重新提交或生成记录。见 `docs/delivery/sidebar-direct-conversation-20261030.md`。

- 对话标题严格单行，优先保留核心症状，去掉“还没量、家长观察、当前精神好”等冗长过程描述；标题和图标黑色，待确认采用明亮橘黄色，已保存的记录在标题后单独显示绿色“已记录”纯文字，无背景；未保存显示黄色“待确认”，已保存但有未确认内容显示“已记录”后跟黄色“有待确认”，每条都有状态；不扩大侧栏。
- 行尾垃圾桶打开底部确认框，明确“删除对话不会影响已保存的记录”；取消不写入，确认删除整组对话及本机副本，正式记录和源附件保持可用。失败保留并可重试，删除后的旧链接、首页恢复和迟到自动保存不能复活对话。见 `docs/delivery/sidebar-delete-compact-20261030.md`。

## 首页记忆库横幅：产品主人确认 2026-10-30

- 移除横幅的“暂停”文字与圆点，不保留可见轮播控件；保留马赛克渐隐／浮现、8秒停留及输入/后台/减少动态效果暂停。鼠标悬停和键盘聚焦仍可停留阅读，首条气泡出现后整体卸载。
- 第二张采用“记忆很长，慢慢记”的长期记忆库隐喻，标题通栏、图左字右，与欢迎张采用不同编排。表达保存记录的长期积累，不承诺模型无限上下文或自动读取全部历史；不改检索/存储能力。见 `docs/delivery/frontdesk-memory-banner-20261030.md`。本段覆盖此前可见暂停与点选规则。

## 首页横幅微调：产品主人确认 2026-10-30

- 欢迎文字稍上移，与右侧护士协调；“边照顾，边记录”单行。保持满屏高度适配和完整图片。
- 保留欢迎张，新增一张长期记录价值表达，使用同风格3D档案图；采用无方向位移的马赛克渐隐/浮现轮换。仅表达已保存记录可回看，不声称AI永久记忆，不编造评价/背书。
- 输入中、后台、减少动态效果时暂停自动轮换；可暂停/点选；首条气泡后仍整体卸载。保留帮助卡到现有帮助中心。见 `docs/delivery/frontdesk-trust-banner-20261030.md`。

## 手动症状表单：产品主人确认 2026-10-30

- 「记录症状」页为手动填写，删除底部按住说话／拍照栏，保存保留在右上角；首页对话录音不在此变更范围。
- 「补充信息」与「发生时间」之间为紧凑「附件」行，图片图标与标题在左，加号始终在同一行最右侧，提供拍照、拍视频、相册三种来源，不提供文件入口。上传后仅显示缩略图，不启动内容解析或展示文件信息／解析结果；沿用六份照片／视频的失败恢复及保存归属。见 `docs/delivery/symptom-attachment-thumbnails-20261030.md`。
- 新原生能力仅在本页使用媒体菜单；首页仍为四项。旧包或浏览器回退为三项来源入口，不冒称能定制浏览器内部系统菜单。契约见 `docs/delivery/symptom-manual-attachments-20261030.md`。

## 首页帮助入口：产品主人确认 2026-10-30

- 首页“怎么用护护／边照顾，边记录”卡片直接打开现有帮助中心，不再打开简短说明弹层；侧边栏删除帮助入口，保留反馈、关于。
- 帮助首页可返回症状记录，帮助内容内的返回、搜索及用户手册沿用现有规则；保留账户／孩子归属及未发送输入。
- 本段覆盖此前首页教程弹层和侧栏帮助入口的局部约定，不改变首页版式、每日文章或其他业务。契约见 `docs/delivery/home-help-entry-20261030.md`。

## 首页高度自适应：产品主人确认 2026-10-30

- 首页欢迎区与两卡连续利用页身实际可用高度，常规手机无图片遮挡、无卡片下大块空白；不能用固定两档压短代替适配。护士保持小幅清晰，文字自然换行。极短屏、键盘和大字号保留内容下限并可滚动。见 `docs/delivery/frontdesk-fluid-height-20261030.md`。

## 首页护士与小屏：产品主人确认 2026-10-30

- 欢迎区改为护士站右侧黑发护士的静态 3D 半身图：戴口罩和眼镜，手持病历夹与笔。此处替代视频；原视频文件、整理过程中的用途不改。
- 欢迎段落限宽并自然换行，与右侧护士独立排布。缩减原固定高度和卡片留白，按页身可用高度适配 iPhone mini；图片完整 contain，不裁人物或让底部输入遮住内容。极短屏／键盘时仍可滚动。
- 下方两卡内容、顺序和第一气泡后欢迎区整体消失规则继续保留。契约见 `docs/delivery/frontdesk-nurse-mini-20261030.md`。本段覆盖旧欢迎视频局部约定，不扩展到其他页面。

## 记录更新红点：产品主人确认 2026-10-30

- 全局移除保存记录后产生的新增/未读红点提示，包括菜单、底导、月历日期、档案分类和症状跟进入口；不改为数量徽标或其他未读提示。
- 删除标记生成、已读处理及其专用状态；升级仅清理旧提示缓存，记录、原件与草稿及正常数据刷新继续保留。契约见 `docs/delivery/remove-record-update-dots-20261030.md`。

## 首页欢迎区：产品主人确认 2026-10-29

- 以已确认的三块高保真版式为准：上方大欢迎区保留文案与缩小的透明护士站视频；下方并排两张小卡，左为“怎么用护护／边照顾，边记录”，3D 图表现妈妈照顾发烧女儿并手持手机记录；右为真实每日小知识标题、摘要与阅读入口，不配图、不放图标。
- 第一条实际对话气泡出现后，欢迎语、视频和两卡全部移除，不留空位；未发送文字、取消录音／附件不算消息。恢复已有对话不重现欢迎区，显式新建空白对话恢复。
- 复用已有每日选文与文章阅读，只开放小知识路径，不恢复其他隐藏模块。不得将预览示例冒充每日真实文章或后台新生成内容。教程不自动提交示例、不写健康数据。
- 本段覆盖此前该首页局部布局；其他页面、输入及持久化维持当前规则。契约见 `docs/delivery/frontdesk-welcome-cards-20261029.md`。

## 首页自动保留与输入：产品主人确认 2026-10-29

- 首页对话、未发送补充和进行中的原件按现有账户/孩子归属自动保留，侧栏可继续打开；切页不再弹保存草稿确认。保留原始输入不等于正式健康记录保存成功；其他独立表单的退出保护继续保留。
- 尚无转写文字的语音处理中只显示 loading，去掉占位麦克风和「语音消息」；失败操作为同行的「重试」「移除」。已有实际转写文字继续显示。
- 关键信息进度用相连圆点及名称表达，完成项圆点和文字变绿，不显示「已获得/待补充」。状态仍以原有信息规则为准。
- 首页相机直接进入系统附件选择，移除网页附件弹窗。包含新能力的 iPhone 包提供相册、拍照、拍视频、文件四项；普通浏览器与旧包沿用系统原有选择，不声称网页能够修改 Safari 的系统菜单。
- 具体业务分支、兼容边界与发布证据见 `docs/delivery/frontdesk-input-simplify-20261029.md`。本段覆盖此前上述局部行为的旧约定。

## 前台关键信息整改：产品主人确认 2026-10-29

- 本轮首页顶部去掉“症状记录”标题，底导名称保持；页身、输入区、底导及安全区统一纸底。欢迎语为“我是记录员‘护护’。有任何情况直接说，我可以帮你整理清楚。”（界面用中文双引号），视频等比例缩小不裁切，孩子信息独立圆角浅绿底。
- 追问直指关键缺口，工具依信息类型选用；数值直接填写、部位用定位器、程度等主观表达可用有实际信息的选项。不仅删除一组三选项，也不以有/没有/没注意等中转题代替获取具体信息。未知不等于正常，问过不等于已获得。
- 记录单仅“情况概述、关键词”默认展开，其余内容默认折叠；正文为普通只读排版，点编辑才进入编辑。确认整理一次生成并保存，保存修改更新同一 ID，以真实回执显示成功。保留原件、识别核对、人物归属、版本、失败重试与旧客户端协议兼容。
- 具体任务契约与证据见 `docs/delivery/frontdesk-key-information-20261029.md`。本段覆盖此前对上述局部行为的约定，不授权其他页面重设计。

## 首页与姓名隐私：产品主人确认 2026-10-29

- 本轮明确授权首页/底导/侧栏采用 `docs/design/frontdesk-navigation-privacy-20261029.md` 的新布局，覆盖旧的前台标题和四项侧栏导航安排；不扩展为其他页面的全局重设计。
- 首页和第一底导为「症状记录」，其余为健康日历、孩子档案、一键整理；默认语音隐藏分类，键盘输入再展开。
- 侧栏身份摘要最多两行并保留用户头像。姓名显示两字 `*末字`、三字 `姓*末字`；不改原件、编辑值和导出。子女关系以女儿/儿子表达，不以爸爸/妈妈作为用户中心身份。
- 欢迎语不含孩子姓名，保留现有护士站视频和绿底白字；不加极光和日期海报。侧栏保留真实历史及帮助/反馈/关于，不显示「产品中心」标题。

## 帮助中心图解与聚焦引导：产品主人确认 2026-10-30

- 恢复侧栏“帮助中心”入口，首页帮助卡保留；帮助内切栏目、搜索、文章及教程往返保留账户/孩子约束的来源，回原页面，不重放一次性对话指令。本段覆盖此前删除侧栏帮助入口的局部规则。
- 入口先突出手动记事和睡眠图解，其余当前操作按用途折叠；所有说明配与实际内容对应的操作示意，不把示例当保存结果。只介绍当前测试版，隐藏功能与任务系统继续不说明。
- 实操用半透明蒙版、真实控件开孔及简短标签，用户自己填写、核对、保存；记录完成以真实eventId/recordId回执为准，再打开准确记录。暂停引导保留输入，弹窗优先、键盘可操作、视口变化重定位、缺目标不锁页。契约见 `docs/delivery/help-visual-coach-20261030.md`。

## Complete user workflows before implementation — owner instruction 2026-10-27

This requirement applies to product planning, feature design, implementation, bug fixes, testing, reviews and handoffs in ChatGPT and Codex. A list of UI changes or passing tests is not a complete business design.

- Before implementation or a test plan, read `docs/delivery/user-workflow-contract.md` and the lesson in `docs/lessons/2026-10-27-workflow-completeness.md`. Use the current implementation and latest confirmed product decisions; do not restore historical behavior from examples.
- Define the user's complete task from entry to a usable persisted result, reopening/editing and downstream use. Write one concrete ordinary case, not just component or feature names.
- Resolve the applicable business rules first: actor/object/task ownership; raw input versus facts, draft and saved result; state transitions, prerequisites, authoritative success receipts, and cross-surface/version consistency.
- Reason through natural branches before coding: fragmented/rapid input, corrections, side topics and object/task switches, cancel/back/refresh/reopen, delayed/duplicate work, partial failure and retry. For each applicable branch, specify the next user action, what is retained, where work resumes and which effects must not repeat. Do not require unrelated edge cases for a trivial change.
- Keep a traceable task contract for cross-message, cross-page, asynchronous or persistence changes. Map business rules to implementation owners and observable acceptance evidence. For small changes a short task record is enough; for documentation-only changes use the bounded scope/consistency checklist rather than inventing runtime tests.
- Do not delegate basic completeness to the owner or ask them to specify predictable failure behavior. Resolve routine details autonomously within scope; ask only for consequential, unresolved product choices. Do not expand a testing request into an unauthorized product rewrite.
- Derive test expectations from the business contract, not from current implementation. Distinguish synthetic responses, real providers, actual persistence, browser execution and Production. Preserve external-call budgets and release boundaries.
- Report design, implementation, verification, deployment and owner acceptance separately. Screenshots establish observations, inspected source establishes mechanisms, and traces establish incident causes; label inference. Never call an archived lesson a runtime fix or a simulated path a verified semantic result.
- When a basic omission is found, repair the missing rule and its directly affected chain, retain the counterexample, and check adjacent consequences. Do not patch only the visible symptom. Keep the contract and unresolved core issues in handoffs; do not claim a complete usable release while its core workflow remains unresolved.

## Family project separation — owner instruction 2026-10-21

- 家庭统筹会是独立项目，唯一家庭代码仓库为 `https://github.com/Hoooho-app/hoooho-family.git`（私有），正式分支 `main`。今后的家庭功能开发、测试、构建和发布进入该仓库，不继续写回本健康仓库。
- 本仓库只拥有 Hoooho 健康产品。本变更移除 `src/pages/FamilyWorkspace`、`server/family-workspace` 等家庭业务，只保留 `server/family-project` 受限路由和有期限兼容桥；不得把家庭业务重新合回健康构建。
- 两项目各有独立 Railway Production 服务和持久卷。家庭正式地址继续是 `https://hoooho.com/family-ray-home-life-workspace`，本健康服务只保留该路径的受限转发和有期限迁移桥。
- 先读取 `docs/family-project-separation.md` 和独立仓库的 `docs/project-separation.md` / `docs/release-status.md`。新服务未健康、家庭数据未校验时禁止切换；不得复制健康用户、医疗资料或 AUTH_TOKEN_SECRET 到家庭项目。
- 本删除变更只能在独立服务与数据迁移、正式入口切换已核验后合并。若平台或迁移仍阻塞，保持草稿，不发布本版本，不创建 Staging、不丢弃源数据。

## Hoho delivery chain: one production environment

- The canonical application repository is `https://github.com/Hoooho-app/hoooho.app.git`; its formal deploy branch is `main`.
- Owner instruction, 2026-10-20: keep one running environment, Railway Production only. This explicitly supersedes the earlier mandatory Staging rules throughout this repository. Do not create, restart, redeploy or require Staging unless the owner explicitly asks to restore it.
- The single official family-workspace address is `https://hoooho.com/family-ray-home-life-workspace`. Use it in user handoffs; do not present a test or Railway platform URL as an additional official address.
- Requested runtime changes follow: development -> appropriate local verification -> commit -> push -> integration into `main` -> Railway Production deploy -> Production verification. No Staging deployment or Staging acceptance is required.
- A feature Worktree or Branch that lacks Railway or Production configuration is not exempt from deployment. Locate the canonical repository and deploy branch, then transfer only the verified change by cherry-pick, a clean branch, or another minimal safe integration method.
- Do not report Deployment as `N/A` merely because the current Worktree cannot deploy. Report that it must be transferred to the deployment repository, and continue there.
- `DONE` is forbidden while any applicable verification, commit, push, `main` integration, or Production deploy/verification remains incomplete. “Ready to deploy”, “waiting for deployment confirmation”, and “current Worktree has no deployment configuration” are not completion states.
- If credentials, permissions, branch protection, provider failure, or a required high-risk approval prevents completion, preserve the evidence and report `BLOCKED`, not `DONE` or `N/A`.
- This delivery authorization does not permit destructive data operations, force-push, secret disclosure, bypassing security controls, or unrelated business changes.
- Documentation, release-policy and CI-verification-target changes do not require redeploying an unchanged application binary; verify the affected configuration and current Production access. Runtime/build behavior changes still require a Production deployment.
- Both Staging services were retired through the authenticated Railway dashboard on 2026-10-20. The Staging environment has zero services and one detached data volume retained as an offline backup; do not delete it or recreate test services. Production is the only running environment. See `docs/production-only-policy.md` for verified evidence.

### Release targets and cost control — owner instruction 2026-10-28

- Follow `docs/release-environments.md` for each channel's purpose, release order, review and completion receipt. A request to submit code does not authorize uploading every client. Runtime changes still follow the existing main/Production chain unless the owner explicitly narrows the task to a branch or says not to deploy.
- Keep local preview/test servers on demand and stop task-owned servers after verification. Preserve source and data. Keep Production available; do not restore Staging or stop the independent family product as part of health-client housekeeping.
- Keep relevant verification. Superseded checks in the same PR may be cancelled; historical one-off branch triggers and automatic paid/Production acceptance must not be reintroduced. Real provider calls and Production writes follow the task's existing authorization and budget.
- Native CI remains scoped to native-related changes or explicit manual runs. TestFlight upload stays manual; App Store submission and mini-program release are separate targets. Reuse an eligible validated build for App Store submission instead of rebuilding every channel by default.
- The current iOS container uses the shared Production site. Web releases can affect installed beta and release containers, so verify compatibility rather than assuming that installation channels isolate data or backend behavior.

### Existing Codex Thread rule refresh

- A new Codex Thread must read both `$CODEX_HOME/AGENTS.md` and this repository `AGENTS.md` before work begins.
- Existing Threads may not reliably hot-load later rule changes. Before resuming an existing development task, compare the Thread start context with the applicable rule file update times; if the Thread predates either file, re-read both rule layers before continuing.

Hoooho Design System V2 is the project's current visual baseline; V1 is historical only.
The reference implementation is the production-approved `/health-events` page,
the `--hoho-*` tokens in `src/styles/tokens.css`, and the components in
`src/components/design-system/`.

- New pages and components must use `--hoho-*` tokens and existing Design System components first.
- Do not define a parallel primary color, typography scale, spacing scale, radius, shadow, button, card, tag, input, modal or timeline style inside a page.
- If a reusable visual capability is missing, extend `components/design-system/` and document it. An extension must be reusable in at least two product contexts and contain no health business logic.
- Do not introduce another UI framework, replace the Design System, or globally redesign the product without explicit user authorization.
- Do not change a frozen page's information architecture or interaction flow while performing visual work.
- A local page request changes only the explicitly named surface; all other product surfaces remain frozen.
- Health event hierarchy is frozen: the list page emphasizes year/date/event summary, while the detail page emphasizes exact time and health fact changes. Shared visual language must not erase this distinction.
- Avoid dashboard density, card nesting, decorative badges, large tinted blocks and nonessential elevation. Sections are flat by default; cards are reserved for important surfaces.
- Hoho is a mobile-first web product. Do not add native-app navigation patterns or unrelated app chrome.
- Backend, API, data, AI/parser, HealthFact and time-resolution changes must stay behind their existing boundaries and must not be made as part of visual migration.

Illustration artwork such as virtual-avatar skin, hair and clothing palettes is an asset-level exception; those colors are not UI tokens.

See `docs/hoooho-design-system-v2.md` for the component and token contract and `docs/ui-audit-v2.md` for the review checklist.

## Impeccable 使用规则

Hoooho Design System V2 是当前视觉基线；V1 只保留为历史。

Impeccable 默认只能用于：

- audit
- critique
- polish
- distill
- responsive refinement
- spacing / hierarchy / alignment / typography refinement
- accessibility and UI anti-pattern review

除非用户明确要求，否则禁止使用 Impeccable：

- redesign 整个页面
- 创建新的视觉体系
- 更换 Hoooho Design System V2
- 修改主色、Typography Scale、Radius、Shadow 基线
- 引入新的 UI Framework
- 改变冻结的信息架构和业务交互

所有 Impeccable 优化必须：

1. 先读取 Hoooho Design System V2；
2. 读取目标页面当前实现；
3. 保留现有产品视觉语言；
4. 只修改用户明确授权的范围。

原则：Impeccable 是 Hoho 的“设计审计和精修工具”，不是新的设计系统。

## Health time semantics

- Health event and health record occurrence times represent facts that already happened or are happening now.
- Every write of `startTime` or `occurredAt` must enforce `value <= current time` in both the UI and the server API.
- The server is authoritative: future values must fail validation before persistence or AI Parser/Organization processing.
- Compare instants after ISO 8601 parsing so client and server timezone differences do not change the rule.
## Hoho Health Chronology

- Health timelines and health-record lists default to newest first.
- The stable ordering contract is `occurredAt DESC -> createdAt DESC -> id DESC`.
- This contract applies to event detail timelines, same-day records, temperature, medication, visit, examination, status-change and backfilled history displays.
- Backfilled history is positioned by its actual `occurredAt`; a newer `createdAt` must not move an older occurrence above more recent health records.
- Year navigation lists only years that contain events and orders them newest to oldest.
- Do not substitute `createdAt` or `updatedAt` for `occurredAt` when displaying or ordering health chronology.

## Email verification authentication release strategy

- Email verification authentication follows the production-only delivery chain: automated verification -> commit -> push -> integration into `main` -> Railway Production -> online acceptance, including real-email acceptance when authentication behavior changes. Do not require a separate test environment.
- Before a Production deployment, `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, and `AUTH_TOKEN_SECRET` must be configured as Production environment-scoped secrets and must never be committed or printed in logs.
- `AUTH_EMAIL_FROM` must be an actual sender allowed by the configured Resend account. Do not guess or deploy an unverified sender.
- The 2026-10-20 production-only instruction applies to internal/family use and future updates. Do not restore the former mandatory Staging gate from historical release notes.

## Hoooho global interaction optimization boundary

When auditing or optimizing interactions, freeze the first-level page structure, navigation and information architecture, approved copy, existing business flows, backend APIs and data structures, brand direction, established names including “健康随记”, nurse characters and original video assets, unrelated animations, and any page or module explicitly frozen by product management.

Unless the current task explicitly authorizes it, do not add or remove first-level capabilities; merge, split, or rename business modules; rewrite product copy; redesign a whole page; change layout hierarchy based on personal taste; expand interaction work into a visual redesign; or install a production dependency.

Inside those boundaries, interaction work may repair non-responsive controls and bad event bindings; missing loading, success, failure, disabled, and retry states; duplicate submissions; broken dialog, drawer, focus, scroll, and back behavior; mobile keyboard, safe-area, obstruction, viewport, and touch-target defects; demonstrated motion, media-continuity, flicker, or layout-shift defects; clear cross-page interaction inconsistencies; and necessary accessibility semantics or keyboard behavior.

Repository-wide interaction audits must use `.agents/skills/hoooho-interaction-audit/`. Inventory and classify before remediation; static source inspection cannot substitute for real browser operation. Parallel agents may perform independent read-only review lanes and return structured evidence, but the primary agent owns all source edits so agents do not concurrently modify the same files.

## Hoooho visual acceptance authority

AI visual scores, blind reviews, and automated gates are supporting evidence only; they do not constitute product-owner acceptance. Without explicit product-owner approval, do not mark a visual exploration as a final success, add it to Approved Screens, or automatically propagate it across the product.

## Shared execution contract (ChatGPT and Codex)

These rules apply to every task, regardless of whether it is executed directly in ChatGPT, in Codex, or through a generated handoff prompt.

- Start from the canonical repository and current `origin/main`; record the base commit, branch and working-tree status. Another workspace is not assumed identical merely because it uses the same repository. Preserve uncommitted work and isolate the task.
- Before editing, turn the user's confirmed requirements into one acceptance checklist, with the named surface, permitted behavior changes, frozen boundaries and necessary direct dependencies. The executor owns this bookkeeping; do not ask the user to reconfirm information already supplied.
- Implement the smallest sufficient change. Do not add unrelated refactors, copy changes, dependencies, API/data/AI changes or product capabilities. Discovering a necessary dependency does not authorize unrelated work.
- Use V2 tokens and existing components. Preserve approved page-specific behavior and current business data. A user's explicit local layout or interaction request authorizes that change only; it does not authorize a global migration.
- Reuse the same checklist in any Codex handoff. Include the base commit, scope, acceptance checks and the mandatory delivery chain; do not summarize away requirements or invent extra ones.
- Review the final diff against the scope, run the required build and relevant automated checks, and operate the changed flow in a real browser at mobile widths. Distinguish browser emulation from physical iPhone/Safari verification; report unverified checks explicitly.
- Follow the delivery chain above. Report implementation, checks, deployment and product-owner acceptance separately. Identical process and observable acceptance criteria are required; do not promise identical code or guaranteed identical model output.

## 首页今日呵护：产品主人确认 2026-10-30

- 领取按钮使用专用的两瓣嫩叶、圆润可爱3D动画质感的小芽透明图片，不使用通用 Material 图标；此素材例外仅限本按钮，不更换全局图标库。见 `docs/delivery/care-sprout-art-20261030.md`。
- 原每日小知识同尺寸区域替换为「今日呵护」，显示「已守护 X 天」和淡色、带小树苗图标且水平居中的「领取树苗」按钮；整卡进入既有 `/care-journey` 任务页，按钮独立领取每日1树芽，成功后为「今日已领取」。
- 守护天数从当前孩子档案的服务端createdAt开始按自然日计算，当天第1天；不记录、不签到仍累计，切换孩子各自计算。领取状态以服务端回执为准，领取不改变守护时长。本口径覆盖此前误用签到次数的实现，见 `docs/delivery/care-days-profile-start-20261030.md`。定向开放任务路由树，其他隐藏模块/侧栏入口不随之恢复。
- 保留欢迎横幅、左帮助卡及首条气泡后整体消失规则。本段覆盖此前首页每日文章入口的局部约定。契约见 `docs/delivery/home-today-care-20261030.md`。

## 侧栏身份层级：产品主人确认 2026-10-30

- 账户是上位“我的”主入口：大头像取昵称末字且字格水平／垂直居中、姓名脱敏；姓名正下方单独显示“记录者”，右侧箭头旁为“我的”；整块进入独立账户页，承接现有设置、账户与安全、绑定及退出。
- 记录对象是账户下的紧凑切换栏，保留孩子小头像、脱敏姓名、女儿／儿子与年龄，多孩子沿用既有选择面板；不扩大侧栏，不改记录归属及草稿。
- 此段覆盖此前身份摘要等权两行的局部版式，姓名脱敏、记录历史与其他页面规则继续保留。见 `docs/delivery/sidebar-account-hierarchy-20261030.md`。

## 身体定位器纯图形：产品主人确认 2026-10-30

- 保留原卡通人物及手足素材；首层直接点人体进入局部，不放周围标签、引线、列表、更多部位或全身不适／位置说不清的兜底入口。局部直接点大区域，五指分别整根、手掌一整块；选中才高亮并显示名称。
- 后续确认：图内选中只用贴合身体部位的半透明剪影，不显示对勾，不用独立椭圆/圆角色块盖图。按原素材外缘裁切，内部分区连贯，重叠多选保持相同深浅；蒙层覆盖区可直接点选，原触控容差和键盘语义保留。见 `docs/delivery/locator-contour-mask-20261030.md`。
- 正面／背面及手足视角切换在图像工作区内居中，不能放右上角；未选区域边缘线极浅、近乎不可见，避免切割人体的感觉。原有选择／取消／返回、对象归属、历史值及保存回填保留。见 `docs/delivery/graphical-body-locator-20261030.md`。此段覆盖此前定位器标签与文字选区的局部安排。

## 呵护之旅简化：产品主人确认 2026-10-30

- 首页今日呵护显示时顶栏无小芽；欢迎区卸载后，孩子信息旁显示同款3D小芽入口，导航进入呵护之旅，不自动领取。与欢迎区显示条件同源，未发送文字不切换，显式新对话恢复卡片。
- 呵护之旅仅保留每日领取树芽、累计成长等级与成就，移除兑换/钱包/主题购买/每日任务与装饰标语；同款两瓣小芽替换原树图。等级阈值保持，原余额、累计、签到和已点亮成就不撤销。停用每日任务奖励及公开兑换API，旧链接回旅程；保留原权益读取和数据。原双任务初程成就改累计30次签到，旧已点亮不重复奖励。见 `docs/delivery/care-simple-checkin-20261030.md`。本段覆盖此前每日任务树与兑换的局部约定。

## 侧栏环抱视觉：产品主人确认 2026-10-30

- 身份区按主人手绘采用浅绿账户包裹奶油杏色孩子栏，左右底角收为简洁圆润小手；细轮廓从两只手沿两侧及顶部连通，中央底边不描线。手臂仅装饰，不遮挡内容或点击。
- 保留账户上位、末字居中头像、姓名下记录者及右侧“我的”，孩子小头像与独立切换。只改此局部，不扩大侧栏、不改账户页、记录归属及历史业务。见 `docs/delivery/sidebar-embrace-20261030.md`。
- 主人实际体验后的微调：轮廓稍粗但更淡，两只手稍靠拢；孩子头像保持原组件sm的36px正方形、不缩成28px，孩子整组信息向内留白，避开手臂。保留底边开放及原交互。

## 首页相机与查找：产品主人确认 2026-10-30

- 首页语音按钮旁恢复键盘右侧相机，沿用原生附件桥接及浏览器系统选择，取消/对象切换/失败恢复/原件归属不变；孩子档案智能上传仍隐藏。本段覆盖此前档案手动优先时一并移除首页附件的局部规则。
- 顶栏新建对话只在当前存在消息或记录内容时出现；空白初始化、仅未发送输入以及新建完成后隐藏，调回已有对话恢复，原忙碌禁用与侧栏新建入口保留。
- 全局search语义统一为大圆短柄的共享光学变体，属于主人明确指定的单图标例外；不改其他Material原图、选择状态规则、数据检索或功能图标库。见 `docs/delivery/home-camera-search-20261030.md`。

## 定位图与标签校准：产品主人确认 2026-10-30

- 原卡通身份与纯图形交互保留，去除白色背景；局部改用清晰位图，胸部增加适度细分，脖子、眉毛、耳部、肘窝、手腕按真实图像位置校准。腹股沟用无外生殖器细节的简洁二维轮廓位图，能直接选择左右褶皱，不在裤子上虚画。
- 新建与历史编辑的已选部位标签距输入留小间距；删除对勾，仅尾部小叉直接移除当前草稿里的该部位，保存后才更新正式记录。匹配的同义手动文本一并清除防止位置复现，其他文本、旧快照及原件保留，迟到解析不恢复手动删除的位置。保存中禁用移除。见 `docs/delivery/locator-detail-refinement-20261030.md`。本段补充此前定位器方案，原 v1/v2 文件仍冻结。

## 首页系统附件菜单：产品主人确认 2026-10-30

- 首页相机直接触发系统file input，由WebKit/浏览器提供默认来源菜单；即使存在原生附件桥接也不调用应用自行拼装的UIKit来源菜单，更不打开网页自绘面板。其他页面专用选择器保留。
- 取消保留输入，选中沿用原件上传/保存；返回时核对账户、孩子和requestId，迟到结果不能串到新对话。具体选项与外观由系统决定，不强制四项。本段覆盖此前首页优先原生桥接菜单的局部规则。见 `docs/delivery/home-system-picker-20261030.md`。

## 首页记录单气泡：产品主人确认 2026-10-30

- 主人进一步澄清：外层为绿色护士气泡，气泡文字说明“记录单已保存”；内嵌一块白色记录单，白色区域头部只保留“记录单”、查看记录和编辑，不重复保存状态。待核对的原话/附件保存范围仍在绿色气泡内明确说明，编辑草稿不冒称已保存。此句覆盖此前将整张记录单融为绿色或把保存状态写进白色单据的理解。
- 折叠内容使用共享右箭头，展开朝下；情况概述、关键词默认展开不变。保存、对象核对、原件、版本与同ID编辑协议保持。见 `docs/delivery/record-bubble-20261030.md`。本段覆盖此前底部状态展示的局部规则。


## 首页固定小芽与动态使用流程：产品主人确认 2026-11-02

- 首页领取只保留姓名后顶栏同款3D小芽入口，空白对话、已有对话及新建后均固定显示；进入原呵护之旅领取，不在导航时自动签到。
- 右侧今日呵护替换为向下五步使用示意：出现症状→说出孩子的情况→护护帮你问清楚→确认并保存记录→补充变化，回看记录。保留横幅、左帮助卡及首气泡后欢迎区卸载规则。
- 示意不发送示例、不调用AI、不写健康数据；完整文字始终可读。单次动画结束静止，可暂停、继续和重播；输入/录音、后台、弹层和离屏暂停，减少动态效果为静态完整流程。短屏保留可滚动阅读与输入可达，不裁流程。
- 本段覆盖原首页今日呵护卡和顶栏小芽交替显示的局部规则；领取幂等、余额、成长与成就不变。契约见 `docs/delivery/home-workflow-20261102.md`。


## 首页逐幕UI演示与入口文案：产品主人确认 2026-11-02

- 左卡标题为“帮助中心”，右卡标题为“怎么用护护”，右标题不加icon。左卡仍进入原帮助中心；顶栏固定小芽规则保留。
- 右卡采用主人确认的高保真逐幕过程：症状框→语音原话→护护追问→核对并保存记录单→补充变化。任何时刻只显示当前幕与紧凑前因，不能恢复为一次铺满整条文字流程。
- 底部删除解释句与步骤数字，只显示五条进度线。暂停/继续/重播保留，输入/录音、后台、弹层和离屏暂停；减少动态效果为静态当前幕，可“下一步”逐幕查看。
- 固定虚构数据标记演示，不调用AI、不发消息、不写记录、不自动领取。此段覆盖上一版4.5秒文字流程及减少动态效果时摊开五步的局部规则。详见 `docs/delivery/home-workflow-20261102.md` 本轮执行契约。


## 首页演示自动循环修订：产品主人确认 2026-11-02

- 本段覆盖前两节首页介绍文案及播放控件：左卡“怎么用护护”进入原帮助中心；右卡删除标题、重播及可见“演示”，保持五条进度线并自动循环。
- 首幕浅红底小手臂起红包与“出现症状”，不重复左卡母女图；后续框使用现有V2淡色。同一例子逐幕推进，最后汇成包含时间、部位、表现和后续变化的完整情况单。
- 输入/录音、后台、弹层、离屏、鼠标悬停/键盘聚焦暂停；减少动态效果直接静态完整情况。仅虚构UI示意，可访问标签保留说明，不写健康数据、不自动领取，首气泡后整体卸载不变。

## 首页六幕情况单结构图：产品主人确认 2026-11-02

- 此段覆盖五幕与五条线的局部约定：首页使用示意为六幕、六条进度线；前四幕不变，第五幕用孩子信息与“目前情况、相关经过与处理、完整资料档案、本次想问”的结构图表达真实情况单，第六幕表达保存给他人查看、复制给AI继续提问。
- 首页介绍卡和流程内全部方块用现有V2卡片阴影；保持淡色、自动循环、无可见标题/播放按钮/演示标记。减少动态效果静态展示最终交接幕，其余暂停/卸载规则不变。
- 只是已有能力的虚构UI说明，不真的下载、复制、分享或调用模型，不把“发起下载”冒称文件保存成功；实际导出仍沿用原情况单页的HTML与文本/提示词复制，不新增自动分享或PDF能力。

## 首页介绍图窗内凹：产品主人确认 2026-11-02

- 本段覆盖上一节介绍卡/流程方块的外投影要求：下方介绍是次要内容，低于主Banner，使用贴近纸底的凹槽外壳和内侧阴影，不再呈浮起卡片。两张介绍卡与六幕内框一并采用此局部层次。
- 新增V2内阴影token只用于本介绍区，其他阴影和主Banner不变；六幕内容、顺序、节奏、暂停、输入与首气泡卸载及真实业务不改。

## 首页浅灰凹槽强化：产品主人确认 2026-11-02

- 介绍区背景再减淡、以近白浅灰为主；此段覆盖之前多色流程框的要求。两张介绍卡、六幕框及模拟保存条统一采用从V2白/墨色派生的浅灰层次，插图和文字保持清晰。
- 内侧上缘阴影加深、下缘亮线更清楚，仍无外投影；主Banner和六幕内容/尺寸/节奏、真实业务不变。

## 对话与说明文字分层：产品主人确认 2026-11-03

- 这是护护全产品的通用文字规则，不限于诊断职责提示。主要对话、症状询问、追问和实际情况描述使用黑色正文；系统性、说明性、辅助提示统一使用蓝色小字。
- “确认整理”等系统引导语也可以使用蓝色，与主要对话内容区分。
- 同一气泡同时包含对话与说明时，形成两个独立文字层级：先呈现正常对话和必要的症状询问，再呈现次要说明。职责说明放在“情况描述”下方，不作为整段黑色主回复占据对话。
- 黑色正文、蓝色说明和小字字号复用 V2 现有 text-primary、info、caption 等 token，保持可读性与一致间距。后续设计、实现和审查遵循此规则。见 `docs/hoooho-design-system-v2.md` 的“对话与说明文字分层”。

## 首页六项记录快捷入口：产品主人确认 2026-11-03

- 首页文字模式快捷标签固定顺序为“记录症状、回传就诊资料、记载用药、喂养与饮食、睡眠、排便”；取消该处日常中间菜单。本段覆盖该处此前四标签及治疗复诊/用药的局部文案。
- 六项各有不同浅色，单行左右滚动、完整文字及44px触点；不得挤成六等分或换行。睡眠/排便沿用现有表单，回传就诊资料沿用原visit资料入口；不新建业务能力。
- 保留现有语音模式隐藏规则、未发送文字/原件/成员归属、返回恢复、底部主导航和正式保存协议。契约与发布见 `docs/delivery/home-six-shortcuts-20261103.md`。

## 首页介绍连续上滚：产品主人确认 2026-11-03

- 右侧使用示意改成连续向上推进：一次突出一个实体，当前项居中、清楚，上一项向上移动并淡化，新项从下方进入；保持向下箭头衔接，不再整幕替换。去掉重复前因小框，追问补充与导出用途归入对应实体。
- 六个步骤与底部六条线保留，结尾循环仍向上接入首项，不倒退。按真实内容尺寸适配，当前项完整可见，历史可在边缘移出；输入/录音、后台、弹层、离屏、悬停/聚焦同时暂停实际位移与时间。
- 外层两张介绍卡保持浅绿且无阴影（覆盖此前外层灰槽）；内部小框保持浅灰内凹。主Banner、左帮助入口、真实数据与业务冻结。减少动态效果静态导出交接，首气泡后卸载，不写虚构示例。见 `docs/delivery/home-workflow-scroll-20261103.md`。
