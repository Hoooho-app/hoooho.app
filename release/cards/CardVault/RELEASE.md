# 护护卡包 iPhone 内测发布

护护卡包使用独立的 bundle ID `com.hoooho.cards`。工程名和 scheme 均为 `CardVault`。iPhone 最低版本 iOS 17，上传使用 Xcode 26 或更新版本的 iOS SDK。

## 编译

在 Mac 上执行 `bash CardVault/scripts/build.sh simulator`，生成 Xcode 工程并进行无签名模拟器编译。执行 `bash CardVault/scripts/build.sh project` 可只生成工程，然后在 Xcode 中打开 `CardVault/CardVault.xcodeproj`。

GitHub Actions 的 `iOS Cards` 会在 `codex/hoooho-cards` 分支发生对应源码或工作流改动时运行无签名模拟器编译。签名上传由同一工作流在默认分支手动触发，并要求对应提交的无签名编译已通过。GitHub 要求手动触发的工作流先存在于默认分支。无签名构建通过是原生工程检查，安装要继续完成 Apple 分发。

## 单独准备 Apple 记录与签名

1. 在现有 Apple 开发者团队注册显式 App ID `com.hoooho.cards`。在 App Store Connect 建 iOS App「护护卡包」，建议主要语言简体中文、SKU `hoooho-cards-ios`。
2. 为这个 ID 创建 App Store 分发描述文件。可在同一团队、确有授权且证书有效时，使用护护记录现有的 Apple Distribution 证书和团队 API key。描述文件和 App Store Connect App 记录必须独立于护护记录。避免混用新旧 API key 的组成字段和证书密码。该工作流只验证和使用已配置的材料，不调用 `allowProvisioningUpdates` 自动创建或修改 Apple 签名资源。
3. 在 GitHub Actions 的 `cards-testflight` 环境配置保护规则及以下变量和 secrets。默认使用卡包独立材料。确认要复用整套团队 API key 和证书时，保留相应的卡包专用字段为空，并在手动发布时显式开启 `reuse_team_credentials`。复用仅限当前仓库本身已配置的同团队材料。证书、密钥和描述文件通过安全后台录入。

| 类型 | 名称 |
| --- | --- |
| Variables | `CARDS_IOS_TEAM_ID`、`CARDS_ASC_APP_ID` |
| 卡包专用描述文件 secret | `CARDS_IOS_PROVISION_PROFILE_BASE64` |
| Apple API secrets | `CARDS_ASC_KEY_ID`、`CARDS_ASC_ISSUER_ID`、`CARDS_ASC_API_KEY_P8` |
| Apple 分发证书 secrets | `CARDS_IOS_DISTRIBUTION_P12_BASE64`、`CARDS_IOS_DISTRIBUTION_P12_PASSWORD` |

4. 默认分支手动运行 `iOS Cards`，打开 `upload_testflight`。工作流校验 bundle ID、Team、描述文件有效期、App Store 记录以及 API key 的访问后签名上传。CI 等待 Apple 完成处理。
5. App Store Connect 核对真实加密合规问题，填写 Beta 测试说明，加入卡包专用内部测试组并给负责人分配可测试构建。从 iPhone 的 TestFlight 查看并安装。工作流上传本身不分发构建或提交正式 App Store 审核。

## 建议的首次真机验收

1. 启动后停在安全门，使用 Face ID 或系统设备密码进入，失败和取消后仍停在安全门。
2. 将 App 切到后台，再打开时观察预览遮挡及重新验证。
3. 用虚构的图片完成一次录入、回读和导出。预览并校验最终文件里的用途水印、马赛克或实心遮挡以及原图是否保持完整。
4. 使用明确授权的样例分别验证护护记录来源、成员归属、跨 App 的数据版本和撤销状态。开发演示使用虚构资料。
