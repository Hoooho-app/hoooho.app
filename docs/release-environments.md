# Hoooho 各版本怎么使用和发布

产品决定：平时只保留健康产品的一套 Production 服务。本地用于必要验证，TestFlight 用于 iPhone 内测，App Store 和小程序各自按发布目标推进。它们不是每次都要依次重发的后台环境。

## 指令对应的发布范围

| 负责人说什么 | 默认处理到哪里 | 完成时看什么 |
| --- | --- | --- |
| 提交代码、更新网页功能 | 必要验证 → GitHub；运行代码按现行规则合入 main 并更新 Production | 提交版本、线上实际版本和目标功能；不自动上传其他客户端 |
| 只提交分支，暂不部署 | 验证、提交并同步指定分支 | 分支或 PR；等待后续发布要求 |
| 更新 TestFlight | 检查共享网页兼容性；有原生变更或明确需要新包时，构建并上传内测 | App Store Connect 构建处理完成，加入本人内部测试组，TestFlight 可安装 |
| 提交 App Store 正式版 | 核对网页依赖和已测构建；合格构建可直接用于正式提交，补齐资料后提交审核 | App Store Connect 审核状态；获批并发布后再看正式商店 |
| 更新小程序 | 只推进小程序及它实际依赖的共享服务 | 微信公众平台的体验版、审核结果和正式版本 |

“提交 App Store”不代表网页、TestFlight、小程序都重新打包。已有合格构建直接复用；需要修复时才产生新构建。必要的依赖验证仍然执行。

## 每一处的用途、入口与次序

| 版本或位置 | 产品上怎么用 | 往哪里发、去哪里看 | 进入下一步的条件 |
| --- | --- | --- | --- |
| 本地 | 修改和必要的自动验证；按需打开，用完关闭 | 本次任务提供的本地预览或测试结果 | 目标流程与直接依赖核对通过；不需要平台审核 |
| GitHub | 保存代码版本和核对变更；不是额外运行的产品后台 | [健康仓库](https://github.com/Hoooho-app/hoooho.app) 的提交、PR、Actions | 相关检查通过；需要发布的代码合入 main |
| 网页 Production | 健康产品唯一运行环境，承载网页及当前 iOS 容器使用的服务 | [护护记录](https://hoooho.com/nurse-station)；Railway 的 production 服务 | 部署成功并核对目标功能；网页没有应用商店审核步骤 |
| TestFlight | 本人先在实体 iPhone 上检查原生能力和完整流程 | [App Store Connect](https://appstoreconnect.apple.com) → 护护记录 → TestFlight；手机 TestFlight 安装 | 构建处理完成、合规信息齐备、加入本人内部组且可安装；这是内部内测流程 |
| App Store | 向正式用户发布 iOS 版本 | App Store Connect 的 App Store 版本页提交；发布后在 App Store 查看 | 选定符合正式提交要求的已测构建，资料齐备，Apple 审核通过后按设定发布 |
| 小程序（尚未上线） | 独立的发布渠道；目前不为它新增常驻测试后台 | [微信公众平台](https://mp.weixin.qq.com) → 小程序 → 版本管理 | 开发版上传 → 体验版核对 → 提交审核 → 审核通过后发布 → 核对线上版本 |
| Staging | 已退役，不参与任何日常发布次序 | 只保留历史资源记录 | 不作为必经环节，不自动恢复 |

常规 iOS 次序：本地必要验证 → GitHub → 共享服务的 Production 核对 → 需要时更新 TestFlight 并在手机内测 → 选定构建提交 App Store 审核 → 正式发布。小程序在自己被要求发布时走独立次序，不是 iOS 上架的前置步骤。

ICP 审核期间，`hoooho.com` 和 `www.hoooho.com` 保持关闭，原生产服务的临时入口为 `https://hooohoapp-production.up.railway.app/nurse-station`。旧 iOS 包固定访问 `https://hoooho.com`，不能通过网页更新替换该地址；恢复 TestFlight 必须更新包含新地址的原生构建。2026-11-01 的修复与实际分发状态见 [TestFlight 生产入口恢复](delivery/testflight-production-entry-20261101.md)。将来迁到阿里云或关闭 Railway 前，还须处理安装包入口并确认更新，不能只切 DNS 就停掉旧包仍使用的服务。

网页共享功能上线后，连接同一 Production 的已安装容器会读取相同网页；不同安装渠道不提供后台或数据隔离。原生地址、代码、权限、原生资源或打包配置等变更需要新的 iOS 包。上线共享变更前必须兼容仍在使用的容器，不能把尚未通过 Apple 审核的新原生能力当作已普遍可用。

## 资源和费用的默认规则

- 本地预览、测试服务器仅在当前验证需要时启动，完成后关闭；保留源码与数据。关闭本地不影响 Railway 正式服务。
- 健康 Production 保持现有单实例，正式数据卷继续挂载。独立家庭项目是另一产品，不因整理健康版本而停用。
- Staging 已无运行服务，保留卷不删除。保留存储仍可能产生费用，不能把“没有运行服务”写成“完全零费用”。
- 网页验证按相关路径触发；同一 PR 更新时取消旧检查，新浏览器证据保留 7 天；失败需要排查时及时留存必要证据。必要测试保留，不把取消过时检查当作降低验收标准。
- 原生检查仅在原生相关文件变化或明确手动运行时执行；TestFlight 上传维持手动触发，不随普通代码提交执行。没有 App Store、小程序自动发布任务。
- 普通自动检查使用本地测试服务和合成供应商。真实 AI、语音识别、邮件和正式站写入按任务已有授权与预算执行，不因提交代码或发布多个客户端默认重复调用。模型 token 与调用量有关，客户端渠道数量本身不会自动复制调用。
- 新增后台实例、重复构建、附件存储和实际请求都可能增加资源使用；保留多个客户端安装渠道不等于必须多养几套后台。实际费用以供应商账单为准，不预估未经测量的节省金额。

## 本次核对和后续执行

本次任务范围、资源只读观察、配置改动及核验结果记录在 [发布与资源整理任务记录](delivery/release-cost-20261028.md)。后续执行者同时遵循仓库 `AGENTS.md` 和 [Production 单环境政策](production-only-policy.md)。小程序的“尚未上线”来自负责人说明；本健康仓库没有发现小程序工程或发布工作流，本次没有登录微信平台核验其账号、云资源或审核状态。

平台依据：[Apple 选择已有构建提交](https://developer.apple.com/help/app-store-connect/manage-builds/choose-a-build-to-submit/)、[内部 TestFlight 分组](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/)、[GitHub 取消过时检查](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)、[Railway 路径触发](https://docs.railway.com/builds/build-configuration)、[Railway 计费说明](https://docs.railway.com/pricing/faqs)。
