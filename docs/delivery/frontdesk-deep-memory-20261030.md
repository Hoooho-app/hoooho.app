# 首页记忆档案横幅调整（2026-10-30）

## 任务与契约

基线 `166df3f931c6f5c38213c464a4c8269549d94f53`，干净隔离分支 `codex/frontdesk-deep-memory-20261030`。家长进入空白首页，先看到既有欢迎张，停留约8秒经马赛克切换看到记忆档案张；紧凑图文传达记录长期积累与细节可查。开始实际对话后整组介绍卸载，不占对话空间；未发送文字、取消录音不算首条消息。

用户要求：密集庞大的文件资料意象，饱满3D风格；标题“记忆很长，不会忘。”；匹配副标题、集中排版。实现为“记录再多，细节也能回头找到。”，左侧标题／副标题相连，右侧档案并排。不新增持久化或后台能力；本次技术范围不包含无限模型上下文、自动读取全部历史或无失误AI记忆。标题为用户指定产品表达。

冻结欢迎张、下方两卡、所有输入／记录业务、侧栏、AI／数据／权限、原视频与其他图片。8秒、560ms两阶段马赛克、80块、预加载失败保留欢迎张、聚焦／悬停／输入／后台暂停、减少动态效果静态欢迎张维持。取消或重新打开仍按既有账户与孩子归属规则恢复，本横幅不读写健康数据。

验收：常见及mini宽高两张同尺寸，标题／副标题／图不碰撞、不裁切，不因切换引入滚动或留白；首气泡期间卸载、输入／录音取消、后台暂停和图片失败复用现有浏览器回归。小幅视觉修改不为文字拼写另造机械测试。真实供应商、正式健康数据写入、实体iPhone验收不在本次自动验证中。

## 图片来源与处理

使用内置 ImageGen（非API/CLI）；参考用户上传截图中巨大密集资料堆的概念，以及现有黑发护士的3D材质与薄荷色。未复制截图海报文字、UI或人物。透明PNG源为 `generated_images/exec-c8fe72a7-aeb9-48ce-aaed-9ec85cc81683.png`；使用现有sharp trim与缩小，生成 `src/assets/nurse-triage/record-archive-dense-20261030.webp`，600×512 RGBA，70,240字节，SHA256 `880e3acd9c127d92f7330578ae58e263262e8255a818ebe27442241f8f6bcdba`。旧档案图保留。

最终生成提示词见下；透明背景，整体完整，不裁切，不放日历／图标／文字／人物。

```text
Use case: stylized-concept. Asset type: transparent 3D illustration for the Hoooho mobile homepage memory banner. Input image 1 (attached social screenshot): conceptual reference ONLY for the enormous densely layered stack of documents, NOT for its poster typography, UI, orange palette, people or claims. Input image 2 (nurse): style/material/color reference ONLY for warm polished rounded 3D, creamy white and soft mint. Create a single cohesive impressive archive: a HUGE thick cube-like stack of hundreds of thin cream paper record sheets, beautifully visible dense layered page edges, arranged into several closely packed softly rounded mint binders with staggered tabs, one subtly unfurled record sheet on top with fine embossed short line marks. The enormous density of documents must be the dominant visual; convey very long accumulated health records and rich details, not a handful of folders or a calendar. Low three-quarter isometric angle, compact broad silhouette roughly 1.2 wide : 1 high; full object visible, no crop, no detached floating objects. Premium friendly sculpted 3D, soft studio lighting, realistic delicate paper edge detail but simplified at thumbnail size, tiny soft grounding shadow. Cream papers, restrained muted mint tabs/bindings matching nurse style. Actual transparent background. No human, no text, no letters, no logo, no calendar, no magnifier, no arrows, no diagrams, no counters or cloud/security icon.
```

## 并发主分支集成

发布前主分支推进至 `07a5b46929109df2dffcdcfcbac062c221dd7959`，包含独立PR #585的今日呵护卡与任务入口。已合并并保留该更新；本次差异仍只为6个横幅相关文件，不回退右侧最新业务卡。合并后重新执行首页浏览器与构建，并以新远端精确头CI为准。

## 验证与发布

本地 `npm run build` 与805项客户端检查通过；首页43个浏览器场景通过（7个重复尺寸场景跳过），2个完整中文预览（375×932、320×568）通过并实际查看截图；布局断言补充图文共同居中、边界完整与不碰撞，最终精确分支另跑对应CI。Production以提交SUCCESS及真实公开JS/CSS/图片核验为准。视觉效果待主人体验，自动检查不等于视觉验收。既有纸体字体子集的中文缺字依赖系统中文fallback；本地完整中文预览沿用仅测试的Noto字体覆盖，不提交字体或线上覆盖，不冒称已核验实体iPhone字形。
