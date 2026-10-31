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
- [x] main 精确提交原生 CI 两系统通过并生成设备归档。
- [x] Production 页面/API 仍可访问，继续使用同一服务；无数据/卷修改。
- [x] TestFlight 上传及 Apple processing 已取得实际回执。
- [ ] 本人内部组分发：Apple 后台登录已过期，仍需恢复登录后完成合规信息及原组分发。
- 实体 iPhone 更新、登录及记录/原件/导出全流程由本人验收，不冒称已完成。

## 原生检查中的启动时序修正
`4929760` 的原生 CI `41230321458`：旧系统 16 项单元及 3 项 UI 全通过；新系统首次仅报告打印在页面冷启动时等待 15 秒超时。单独重跑后 16 项单元全部通过、打印约 5.9 秒完成，但手动附件 UI 在测试页尚未出现时触发 20 秒等待失败，随后同一按钮实际出现且菜单操作继续成功。两次失败和原始日志均保留，未上传未通过的版本。
修正测试前置条件：报告测试先等 WKNavigationDelegate 的文档完成回执，再主动触发报告打印，原 15 秒桥响应预算及全部报告内容断言保留；UI 测试先以真实夹具标题等待 WebKit 页面就绪（最多 60 秒），再执行原按钮、取消、菜单和布局检查，不移除失败断言，不跳过原系统。这个等待只用于合成测试，不改变应用启动、登录、数据或权限行为。

## 后续迁移约束
本包启动地址固定为 Railway Production；将来关闭 Railway 或切换阿里云前，必须同步处理 iOS 包入口并确认用户已更新，不能只改 hoooho.com DNS 后就停掉仍被安装包使用的服务。旧域未发送草稿保留在原域存储，未自动复制到新域。


## 本轮实际发布回执（2026-11-01，北京时间）
- 上传源码 `20d94c164204d34e9a88590a829fc924665abcd8`（原生地址修复 `4929760`，测试就绪等待修正 `20d94c1`），上传时为 main。
- [原生 CI #38 / 41231688979](https://github.com/Hoooho-app/hoooho.app/actions/runs/41231688979) SUCCESS。两系统各 16 项单元与 3 项 UI 通过；当前系统设备归档成功；相关本地 JS 桥 7 项通过。此前失败保留，未删除或跳过功能断言。
- [上传 #9 / 41232269777](https://github.com/Hoooho-app/hoooho.app/actions/runs/41232269777) SUCCESS，job `124628757465`。Apple 版本 `0.1.0`、构建 `1.9.1`，03:04:23 上传成功，03:06:25 完成 processing，实际日志包含 `Successfully uploaded the new binary` 和 `Successfully finished processing the build 0.1.0 - 1.9.1 for IOS`。
- 健康 Production 原生地址 `/api/health`、`/nurse-station` 均 HTTP 200。新包首页改到同一生产服务；备案域名仍关闭。未读取或写入真实业务资料，未新增签名、测试者或权限。
- App Store Connect 当前停在 Apple 登录页面，显示身份核验失败；尚未核验新包的合规状态、What to Test 或「护护首轮内测」组分配。上传/processing 完成不等于手机已可更新，不宣称 TestFlight 分发或实体 iPhone 验收已完成。
- 需用户恢复后台登录后，在既有 App 与本人内部组处理 `0.1.0 (1.9.1)`，不重复上传、不新增组或测试者、不提交正式 App Store 审核；手机通过 TestFlight 原位更新，不卸载，以保留旧域本机资料。
