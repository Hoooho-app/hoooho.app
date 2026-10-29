# 首页文图微调与长期记录横幅

基线 main `08b11b6281716566f867d2593cc45c48d79a787d`，干净隔离分支 `codex/frontdesk-trust-banner-20261030`。

家长打开尚无气泡的首页，欢迎文字略向上，与右侧护士自然错位；下方“边照顾，边记录”保持一行。仍按页身实际高度铺满，护士及照护图片完整，帮助卡仍进入现有帮助中心。

新增且只新增一张“记过的，以后能回看”横幅，表达保存的记录能从健康日历回看。使用同风格3D档案插图，不宣传AI永不忘记、无限保留、自动获得所有历史，不使用虚构评价、用户数、背书。既有按账户/孩子归属及正式保存规则是事实来源，本轮不改数据或保存。

本次建议：每张稳定停留8秒，再用无位移的马赛克块逐步隐去、再浮现；旧文字/图完全被遮盖后才换新内容，整个切换约1.12秒。两张共用尺寸，切换不挤动下方两卡。图加载失败保留原欢迎图，不展示空图；新图准备好后才自动轮播。可暂停或点选，输入/录音操作、焦点操作、后台与减少动态效果时暂停自动切换；减少动态效果下手动点选直接切换。退出/首条气泡出现时卸载并清理计时器；恢复已有对话不轮播。未发送输入、取消语音/附件保留原流程；返回首页重新从欢迎张开始。

范围：仅欢迎横幅、该处样式/资产、对应浏览器检查、规则及契约。其余卡片数据、帮助/文章、底导、输入、AI与后端冻结，不上传原生包、不写正式健康数据、不调用付费验收。

验收：320–430宽、568–932高两张均文字图不重叠、不裁图、不溢出正常页身；单行卡文案；长屏欢迎文字比居中位置稍上移。按实际时间序列核验8秒、出/入碎片效果及无位移；暂停/恢复、输入与减少动态效果、坏图、首条气泡在切换中出现后卸载、刷新/帮助往返等既有流程。构建、客户端和相关浏览器检查后按main→唯一Production→SUCCESS→公开health/首页/JS/CSS/图片只读验证交付；模拟和物理iPhone/主人验收分开。

资产：内置ImageGen，以现有护士为风格参考，生成透明薄荷绿档案夹、分层记录页与台历，圆润3D材质、无文字和安全背书；原图不覆盖，压缩为WebP保存到本仓库。

生成模式：内置 ImageGen，透明背景。成品 `src/assets/nurse-triage/record-archive-20261030.webp`，480×559，56,562 bytes，SHA256 `3a1d1cd91e4c1c9825eaef0bc23ad4811c1a507f0e6412a0f65f4abda5be2d1b`。

最终提示词：

> Use case: stylized-concept. Asset type: one transparent 3D illustration for Hoooho children's record app home banner. Input image is STYLE REFERENCE ONLY: match its premium softly rounded, full-bodied 3D materials, warm light and muted mint/ivory palette; do not recreate a nurse or person. Primary request: a beautiful compact still life communicating personal records carefully kept over time and easy to revisit. A substantial open mint-green archive binder with neatly layered warm ivory record sheets and small sage tabs, alongside a small rounded desk calendar with a few gently staggered pages. Subtle embossed lines and little time marks on paper, no legible text or numbers. A restrained warm apricot page tab adds warmth. Objects feel tactile and reassuring, polished animated-film 3D, not flat vector or watercolor. Three-quarter view, vertical compact arrangement suitable for the RIGHT third of a mobile banner; all objects fully visible, clear silhouette, no large padding around the object group. Soft grounding shadow only, no surrounding room or desk slab. Transparent background genuine alpha. No people, no hands, no shield, no lock, no heart, no badge, no promotional claims, no logos, no text, no watermark.

集成保留 main `750e088f486822aff2b4c67e9e04a62a365195d4` 的手动附件缩略图改动；无代码冲突。构建与806项客户端检查通过；最终入口/样式已重新打包，43个本地浏览器场景通过（原有32+新增11，另7项只跳过重复resize）。截图复核长短屏两张与真实CSS马赛克中间帧；8秒计时使用受控时钟，CSS分块渐隐由浏览器合成帧核验；后台可见性为显式模拟，实体iPhone和主人视觉验收未声称完成。原有帮助/对话/取消/恢复链路均保留，生产发布回执写入本次PR。
