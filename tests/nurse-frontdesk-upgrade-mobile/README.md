# 前台对话升级手机回归

运行：`npx playwright test --config tests/nurse-frontdesk-upgrade-mobile/playwright.config.ts`。

375px iPhone SE、390px 和 430px 的浏览器上下文在后台运行，使用隔离合成账号、真实上传/持久化 API、既有识别任务及草稿恢复。AI 输出通过 `tests/visit-sheet/serve.mjs` 的测试替身控制，不连接付费供应商；本套测试验证程序与 UI 状态，不代表真实模型理解、临床读图能力或实体手机通过。

`/front-reply-data` 设置本轮合法 v2 响应，`@latest` 绑定当前真实消息 ID、`@context` 绑定当前事项。用例不靠模型回答长度断言效果，主要检查来源、候选是否改变、真实保存回执、旧版本响应及成员隔离；也覆盖ready零候选附件的显式保存意图、刷新恢复、原件版本重新确认、成员切换，以及全坏图原件逐字节下载、确认回执丢失恢复、真实导出文件内容与旧下载气泡恢复。

截图保存在 `test-results/nurse-frontdesk-upgrade-mobile/` 的各用例输出目录，包含自然零候选回复、仅图片上传结果及真实持久化成功；均为运行截图，不是设计图。
