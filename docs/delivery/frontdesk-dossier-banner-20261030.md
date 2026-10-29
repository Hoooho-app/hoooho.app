# 首页完整档案与情况单合成图

基线：干净main `cec1bfb079c8b56c54d371541d6451253beca181`，分支 `codex/frontdesk-dossier-banner-20261030`。用户确认上一轮视觉方案并要求落实，夹子上的AI标识按删除理解，已在开始时明确说明。

家长进入空白首页，依次阅读欢迎／就诊情况单／记忆三张介绍。每张完整停留10秒（原8秒加2秒），随后沿用560ms覆盖、560ms浮现的马赛克循环。聚焦、输入、录音、后台暂停，减少动态效果静态欢迎，图片独立预加载、失败跳过与迟到加入，首气泡后整组卸载不变。未发送输入、取消和刷新恢复等归属与原件由既有业务处理，本任务不增加任何保存或模型调用。

就诊张标题“一键整理，一次说清。”；正常屏副标题“把零散记录，整理成完整资料。问医生、问 AI，带上来龙去脉。”；极短屏保留核心短文“问医生、问 AI，带上来龙去脉。”。新合成透明配图保留已确认的左后完整档案／右前体面情况单、纸页连接关系；夹子光滑无AI字样。正常屏采用上文下图，短屏采用紧凑双列保证同尺寸、图片完整、不碰撞与无额外滚动。标题和正文保留真实HTML文字，不将整张方案截图作为界面。

冻结其他两张的文案与图片、首页两卡、输入／侧栏／报告／AI／导出／数据／权限等其他页面与业务。只介绍现有资料整理与交接，不新增自动全档案读取或诊断能力。仅现有Production网页发布，不新建Staging或原生包，不写正式健康数据、不运行真实付费AI验收。

验收映射：10秒停留／三张循环及各暂停分支→浏览器时钟与现有流程；正常／短屏布局→5种宽高边界、内容不碰撞、同横幅尺寸、完整图片；新合成图与无AI标识→实际查看生成图与完整中文浏览器截图；线上→对应main终态SUCCESS和只读健康、首页、实际JS-CSS-WebP字节核对。模拟不冒称真实供应商或实体iPhone验收。

## 图片与验证

内置ImageGen从已确认方案提取／编辑为独立透明配图，移除画面标题、背景与夹子AI字样。源PNG `generated_images/exec-fc4bdd75-d0fc-46f6-9d35-a0376a516354.png`，由现有sharp裁透明留白、缩至720宽WebP，保留原PNG与旧项目图。项目素材 `src/assets/nurse-triage/visit-summary-banner-dossier-20261030.webp`。最终提示词见下。

验证结果将在PR发布回执补齐；正式账户页面、实体iPhone未冒称自动验收。中文预览沿用测试专用Noto覆盖，不提交产品字体。

最终生成提示词：

```text
Edit the provided approved Hoooho banner concept into a production-ready transparent artwork ONLY. Keep exactly the same cohesive two-part 3D object composition from the lower half: a substantial multi-volume archive on the left/rear with dense layered papers, continuous fan of record pages joining it to an elegant substantial organized dossier/clipboard on the right/front, mint binding, cream pages, tabbed sections, timeline and structured small record panels. Preserve its polished premium rounded 3D style, creamy white/mint palette, perspective, softness and material details. Remove ALL surrounding green banner background and ALL Chinese marketing typography; output only the two connected objects and tiny soft grounding shadow on actual transparent background. CRITICAL: remove the 'AI' letters from the top clip and leave a plain smooth unmarked cream-metal clip; there must be NO readable text, letters, branding, numbers or AI marking anywhere on the artwork. No extra objects or UI. Keep all object edges complete, uncropped. Compact broad approximately 1.3:1 silhouette so the combined dossier and archive are legible on a small mobile banner. This is not a full banner mockup; image asset only. Do not change the design into a single thin clipboard.
```
