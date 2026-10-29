# 原生附件菜单 TestFlight 发布

日期：2026-10-30（Asia/Shanghai）。延续已授权的 iPhone 内测发布：新包包含手动症状页的三来源系统菜单，读取共享 Production 中的紧凑附件与其他已合入网页调整。只使用既有 App、签名及本人内部组，不新增测试者、不提交 App Store 正式审核。

## 版本与验证

- 源码提交：`e459148446a6e77376b57cfd75310358a60ef9e3`，上传时为正式 `main`。原生文件相对已通过的 `750e088` 无差异，保留后续网页更新。
- 精确提交原生检查：[run #32 / 40948351713](https://github.com/Hoooho-app/hoooho.app/actions/runs/40948351713)，attempt 2 SUCCESS。当前系统保留已通过结果；旧系统重跑 `123715338727` 的 13 项单元、3 项 UI 均通过，包括报告 iframe 打印桥接、三来源媒体菜单及四来源首页菜单。首次旧系统作业 `123709553877` 的打印等待 15 秒超时保留在日志中；未删除断言或改动运行代码。
- Production 部署 `3ba06d3c-bb27-4cf0-a1ba-fad89befd979` 对同一提交为 SUCCESS。实际重新打开空白手动表单，核对图片图标、附件标题与右侧加号同行（空态约 62px）；安全裁剪的正式站截图已保存，仅包含空白表单。没有合成正式健康写入或真实供应商调用。
- 上传：[run #7 / 40951138838](https://github.com/Hoooho-app/hoooho.app/actions/runs/40951138838)，作业 `123719258879`。SUCCESS。精确提交原生门禁、Apple 账号配置及现有签名材料校验通过；版本 `0.1.0`、构建 `1.7.1` 于 2026-10-30 04:43（Asia/Shanghai）上传成功，04:45 Apple 处理完成。日志明确包含 `Successfully uploaded the new binary` 和 `Successfully finished processing the build 0.1.0 - 1.7.1 for IOS`，并提示安装尚未核验。

## 完整使用与后续核对

本人通过 TestFlight 安装新包 → 打开共享正式网页 → 手动记录症状 → 附件行右侧加号 → 拍照／拍视频／相册 → 只显示缩略图 → 右上角保存 → 在相同孩子的记录中查看原件。取消、返回、失败重试及归属沿用已验证的附件契约。首页相机仍为四来源。实体 iPhone 的拍摄、安装与上述完整保存需本人验收，模拟器检查不冒充实体设备验证。

已保存到此构建的测试内容：

1.「记录症状」手动填写，保存保留在右上角。
2.附件右侧加号提供拍照、拍视频、相册；上传后只显示缩略图。
3.取消选择、返回重开、上传失败重试或移除，以及保存后查看原件。
4.首页语音记录、切页自动保留和相机四种来源继续可用。

## 登录后完成内部测试分发

本人回复「已登录」后，在同一 Chrome 的已登录 App Store Connect 页面继续处理现有 `0.1.0 (1.7.1)`，没有重新构建或上传。原先的登录阻塞已经解除。

- 在构建详情保存上述简体中文 What to Test，页面显示 Saved。
- 核对原生工程只使用 Apple 系统框架、WKWebView 和 HTTPS，未发现自行实现或额外引入的加密算法；原生文件与上传源码 `e459148` 无差异。在 App Encryption Documentation 选择 `None of the algorithms mentioned above` 并保存，Missing Compliance 已解除。[Apple 官方文档](https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption)说明，仅使用 Apple 操作系统内加密的 App 无需在 App Store Connect 上传加密文档。
- 将此构建加入既有内部组「护护首轮内测」，构建详情显示该组及既有 1 名测试者；没有新增组、测试者或外部邀请。
- 该组 Builds 页面显示 `0.1.0 (1.7.1)` 为绿色 `Testing`，90 天后到期。已保存仅含组与构建列表的页面截图；内部 TestFlight 分发完成，可安装。
- App Store Connect 的既有测试者状态另显示 `Installed 0.1.0 (1.7.1)`。这是 Apple 后台的安装状态回执，不等同于本轮实际操作实体 iPhone；拍照、拍视频、保存后重开原件的实体设备流程仍由本人体验验收。

本次只更新发布回执，范围、版本与链接已核对；不修改原生、网页运行代码、构建或发布配置，不重复 CI 或重部署相同二进制，不提交 App Store 正式审核。

上传期间主分支另合入共享网页的首页横幅更新 `b6d30b4`，原生源码及上传流程未变；新包继续读取当前 Production，不重复上传同一原生实现。后续回执只含文档，基于最新 main 保存，保留其他任务的工作。
