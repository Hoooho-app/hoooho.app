# 前台七项整改 · 2026-10-25

基线：`origin/main` / `4408b00801c7024db3302821db46a1d205a82402`；分支 `codex/frontdesk-seven-updates-20261025`；开始时工作区干净。

## 验收清单

- [x] 首页「护护 AI」改为「前台」。
- [x] 欢迎横幅保留「孩子的情况，慢慢说，我来记。」与小护士站表达，用现有视频右侧黑发护士的半身静态招呼图；使用现有主题颜色。
- [x] 护士站原视频在解析对话内容时出现，停止解析即收起；尊重减少动态效果设置。
- [x] 新记录默认不启用症状跟进；对话中询问并由用户点击启用；仅有正在跟进的事项时显示卡片，最后一项结束即隐藏。
- [x] 欢迎区「查看之前的对话」移到右上角三点菜单，新建对话下方命名「之前对话」。
- [x] 双方气泡恢复头像；助手使用原金发护士；保持通栏宽度，头像嵌入气泡，不挤占正文。
- [x] 侧栏移除「对话记录」。历史详情在「回到当前对话」上方提供「继续此对话」，恢复原会话并可继续输入、刷新和保存；保留原有当前会话。
- [x] 录音过程中显示实际识别文字；取消、切换成员和离开时清理预览；保留完整原录音和最终转写链路。

范围：前台、相关历史页、侧栏指定入口及实现这些交互必需的记录和语音接口。既有护理问答、健康事实、家庭项目与其他页面保持原范围。使用 V2 组件与主题。验证后提交、推送、合入 main、部署 Railway Production、检查正式入口。浏览器移动端模拟与实体 iPhone/Safari 验收分别记录。


## 实现与本地验证

- 欢迎图使用内置图像生成，以原视频右侧护士为参考，保留人物特征，透明半身挥手图 640×640，约 50KB。文件 `src/assets/nurse-triage/front-desk-welcome-20261025.webp`。
- 录音层直接展示 Qwen 实时 ASR 返回的 text+stash；使用已有百炼配置和服务端 `ws` 中继，浏览器不接触密钥。实时文字不作为健康事实保存；松手后沿用完整原录音与最终转写。连接失败有明确提示，原录音继续。新用户资料对话也支持预览。
- 续聊按 `conversationId` 关联展示；独立的已保存记录意图保留，新增原文只进入新的记录。成员校验、不可变重试、取消恢复、旧任务隔离与保存 checkpoint 均有回归覆盖。
- 完整构建通过；685 项相关服务端检查、760 项客户端检查通过。
- 18 项移动端首页浏览器检查通过（含 320–1280 宽度、实时文字截图、显式跟进、历史续聊持久化和取消）。首次孩子资料流程 5 项浏览器回归通过。
- 实体 iPhone / Safari 尚未验收；模拟浏览器通过不代表真机通过。专业护理验收范围沿用既定约定。

实时 ASR 接口依据：[阿里云实时语音识别](https://help.aliyun.com/en/model-studio/real-time-speech-recognition-user-guide)、[服务端 text/stash 事件](https://help.aliyun.com/zh/model-studio/qwen-asr-realtime-server-events)。服务端内存中继与现有单实例 Production 相匹配；将来增加副本前需增加会话路由或共享中继。

## 生产部署与验收

- 实现 PR [#521](https://github.com/Hoooho-app/hoooho.app/pull/521) 已合入 main，运行提交 `f6a8020c6bf4f0a6a0b73924b33889dc462e4179`。
- Railway Production 部署 `42d87358-1385-45da-ab47-3efbde736881` 于 2026-10-25 16:16（北京时间）达到 `SUCCESS`；沿用原单实例、域名与现有供应商配置。未接受无关的待应用变量变更。
- [正式前台](https://hoooho.com/nurse-station) 已通过连接的 Chrome 实际读取：标题为「前台」、黑发护士静态招呼图可见、空的症状跟进卡与旧历史按钮不出现。移动尺寸与续聊写入流程由本地及 CI 的隔离浏览器覆盖，没有向用户真实孩子写入测试资料。
- 云端 [Smart record verification #65](https://github.com/Hoooho-app/hoooho.app/actions/runs/40175446433)、[Session recovery #22](https://github.com/Hoooho-app/hoooho.app/actions/runs/40175446429)、[Quick search #22](https://github.com/Hoooho-app/hoooho.app/actions/runs/40175446555) 均为 `success`，包括智能记录、首页、新用户、空白对话和相关视觉检查。
- [一次性实时 ASR 生产验收](https://github.com/Hoooho-app/hoooho.app/actions/runs/40176020720) 通过：实际运行提交与上述一致；`qwen3-asr-flash-realtime` 握手约 1300ms，输入会话关闭前已返回中间文字。该检查证明实时链路可用，不代表识别准确率或护理专业验收。
- 一次性检查使用阿里云公开示例音频与新建空白虚构账户，不创建孩子或健康记录；实时会话已关闭、登录已注销。空白测试账户保留，报告不包含任何凭据、账户身份或会话标识。专用测试分支/草稿 PR #522 仅留作取证，未合入运行代码。
- 实体 iPhone/Safari、硬件触感及产品主人视觉验收仍需实际确认；本轮未进行 App Store 上架。
