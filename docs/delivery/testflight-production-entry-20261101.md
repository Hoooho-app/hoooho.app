# TestFlight 生产入口恢复（2026-11-01）

## 任务、原因与范围
用户在 ICP 审核期间需要直接通过已安装的 TestFlight 应用使用同一套 Railway Production。基线 main `d7eea1e53218dc6dd0a7f166d7a390aa09fc5c56`；隔离分支 `codex/testflight-production-entry-20261101`。
已检查当前 NavigationPolicy.home 与已发布 0.1.0 (1.7.1) 的发布记录：原生固定访问已关闭的 hoooho.com，且录音、消息桥与 blob 导出也只认该域名。网页原生入口恢复不能更新旧包常量。本轮只修这条依赖链，复用原 Apple App、既有签名、内部组及 Production；不恢复备案域名、不新增环境、不改业务/API/数据/权限授权流程。

## 完整普通案例与恢复
用户在 TestFlight 原位更新（不卸载）→ 新包打开 https://hooohoapp-production.up.railway.app/nurse-station → 原账号在新域重新登录 → 原孩子与已保存记录由同一 Production 返回 → 继续输入、录音/选择原件、保存 → 重开查看同一记录和导出。实际业务写入由本人体验，本次不制造生产健康记录。
新域 Cookie、IndexedDB 与旧域隔离；不清理旧域会话或未发送草稿，不声称自动迁移旧域草稿。旧包继续失败须更新，不以重试冒充修复。断网重试保持当前逻辑，不清存储、不自动重发写入。备案通过后另行核验迁移最新服务及数据，不能切回阿里云旧副本。

## 规则与实现责任
- NavigationPolicy：首页切到准确 Railway Production 主机；仅原正式域与这个准确 HTTPS 主机可信，禁凭据及非标准端口。家庭路径保持外开。
- 录音/拍摄：系统权限规则不变；主帧、frame URL、页面 URL 与请求 origin 必须属于同一可信主机。跨主机 iframe 不因双方各自可信获得权限。
- WebViewController：消息桥复用同源 origin 检查，srcdoc 报告按继承的同源 origin 保持打印；原件、分享与外观只在原有允许位置执行。
- NativeBridge.js：只注入两个精确可信 origin；报告子帧仅打印/分享，附件及外观仍主帧限定。
- blob 下载：只接受可信 HTTPS origin 的 blob，恶意相似域、其他 Railway 项目及凭据/端口不放行。
- 版本发布：本提交原生 CI 在新旧系统通过 → 现有签名上传 → Apple processing 完成 → 同一内部组可安装。模拟器、生产网页、Apple 后台及实体 iPhone 验收分别记录。

## 验收
- [x] 相关本地 JS 桥回归（7 项）通过；Swift 安全规则由真实 Mac 原生 CI 检验。
- [ ] main 精确提交原生 CI 两系统通过并生成设备归档。
- [ ] Production 页面/API 仍可访问，持久卷及旧数据保持。
- [ ] TestFlight 上传、Apple processing 及本人内部组分发取得实际回执。
- 实体 iPhone 更新、登录及记录/原件/导出全流程由本人验收，不冒称已完成。

