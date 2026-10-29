# 首页就诊情况单横幅（2026-10-30）

## 任务与交付契约

基于干净 `origin/main` 的 `cd6ffe411bc345297bd3b0cfcbaa2d2a35945bf7`，隔离分支 `codex/frontdesk-visit-banner-20261030`。家长第一次进入空白首页，希望理解为什么需要护护：平时分散记录，问医生或AI时用已整理的情况单讲清经过。主人满意现有欢迎／记忆横幅，本次只在两者之间新增就诊情况单介绍；新文案／配图由执行者设计。

设计采用：小标题“就诊情况单”；主标题“一键成单，一次说清。”；副标题“问医生、问 AI，不用从头讲。”。配图为零散笔记汇成一张清晰的3D薄荷绿夹板情况单，图左文右，保持现有饱满3D与页面tokens。情况单已有读取记录／整理／可核对报告与复制／导出能力，本次仅介绍，不新增生成入口、自动调用AI、不生成或写入情况单，不改变已确认／待核对的业务边界，不声称新增诊断或完整信息自动采集能力。

普通案例：空白首页显示“今天怎么样？”→8秒停留后马赛克切至就诊情况单→再停留8秒切至“记忆很长，不会忘。”→再停留8秒回欢迎张。三张共享同一横幅尺寸，不挤占输入和底导。首条实际气泡出现后欢迎区与两卡仍整体卸载；恢复有消息对话不出现介绍，显式新建空白对话恢复。历史对话、未发送文本和原件仍由原业务按账户／孩子归属恢复，不重复提交。

冻结欢迎与记忆张的文案／配图、首页帮助和今日呵护卡、底导／侧栏／输入／记录业务、AI／存储／权限／所有其他页面。仅新增横幅与三张轮换所需的直接依赖。8秒停留、560ms覆盖／揭开、80块马赛克、无可见控件保持；悬停／聚焦暂停，输入／录音／后台暂停，减少动态效果静态欢迎保持。

资源分支：两张产品配图独立预加载；尚未可用／失败的张跳过，另一张继续可看；两图都不可用则静态欢迎。迟到成功可加入后续轮换，卸载后加载事件不更新状态；显示时资源失败回欢迎并排除该张。取消录音／附件或未发送输入不触发首消息卸载。仅本地合成数据验收，不写正式健康资料、不调用真实付费供应商。

验收映射：顺序／循环／各自停留→浏览器虚拟时钟和标题／图片检查；布局→5种常用宽高三张同尺寸、不碰撞、图片完整、卡片底部无溢出；暂停／取消／首消息→复用现有浏览器流程；部分／全部图失败与迟到→路由拦截后验证可用张／恢复；实际马赛克→浏览器CSS中间透明度观察。原有正式导出能力仅源码核对，不冒称本次执行了真实就诊整理或实体iPhone验收。

## 配图来源

内置ImageGen生成（非API／CLI），现有记忆档案图仅为材质和配色参考；透明PNG源 `generated_images/exec-89789bb3-1230-47dd-9b15-511d10226bea.png`。现有sharp裁透明留白并缩小为 `src/assets/nurse-triage/visit-summary-banner-20261030.webp`，480×528，36,456字节，SHA256 `459dfddbbc7356e8bdab3e19a5df88166774718e4fdb333e1f5b9ef12828ba50`；保留alpha；源图完整保留，不改既有配图。图中无真实个人健康资料，线条仅为示意。

## 集成布局反例

当前主分支集成后的CSS顺序使旧 `body .smart-record-home .front-desk-welcome`（flex）覆盖同优先级editorial（grid），浏览器实测375×812在卡片下留147px空白，原有满屏断言失败。仅为现有editorial根规则补上同元素的 `.front-desk-welcome` 类以明确优先级，保留既定满屏网格与容器断点，不改整体比例或旧欢迎内容；原断言保留。

发布前先合入主分支 `d6071cf6e3e43088f0d86d1dcb1bde078a09307c` 的账户优先侧栏和发布记录，再合入 `0ef59b1993f8109638d52db8d1b42fbd88d2719a` 的帮助中心更新；帮助中心独立修复了相同的editorial优先级问题，合并保留其注释和规则，不重复实现或回退；保留其他线程变更，本次相对main仍仅8个横幅相关文件（包含新图片路径的既有CI触发规则，不新增权限或工作流）。

## 验证与发布

最终生成提示词：

```text
Use case: stylized-concept. Asset type: transparent 3D product illustration for Hoooho mobile visit-summary banner. Reference image: the existing dense record archive, STYLE/material/palette reference only, not the subject. Primary request: everyday scattered health notes become ONE clearly organized visit summary sheet for explaining history to a doctor or an AI. Show a single elegant cream paper report on a rounded soft mint clipboard with a small realistic silver clip. This main page is dominant and clearly organized into three short horizontal information sections, using subtle mint section rules and fine short grey embossed line marks, no readable words. Two much smaller loose cream note slips peek closely from behind the left edge at different angles, suggesting scattered notes gathered into the single neat front report. Make one compact cohesive sculptural object, tall-ish but near-square silhouette 1:1.1, slight three-quarter view, clean fully visible front report face, generous clear page area. Warm premium rounded polished 3D matching archive and nurse illustrations, gentle studio lighting, restrained mint and creamy white, fine paper texture, tiny contact shadow. Actual transparent background; preserve complete object, no crop. No person, no handwriting, no readable text, no letters/numbers, no giant pile, no calendar, no logo, no icons, no arrows, no floating detached decorations. The report is a visual metaphor, not a precise real medical document.
```

本地完整构建／类型及资源检查、806项客户端检查通过。修正CSS优先级与新图尺寸后，49个首页浏览器场景通过（7个重复尺寸场景跳过），包括三张顺序与循环、5种尺寸不变高、部分与全部资源失败、迟到加载和原有暂停／首消息卸载；2个完整中文三张预览（375×932、320×568）通过，已查看新图长屏与mini截图。未降低既有满屏／尺寸／边界断言。按仓库授权进行本地验证、PR、精确头CI、main、现有Production部署和只读健康／首页／真实JS-CSS-WebP核验。只有对应提交终态SUCCESS及实际资源匹配后报告已发布。视觉效果需主人体验；实体iPhone与正式账户实际页面不冒称自动通过。完整中文字形预览沿用仅测试的Noto覆盖，不向产品提交字体或覆盖。
