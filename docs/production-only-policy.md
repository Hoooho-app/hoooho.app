# 家庭统筹会：唯一正式地址与单生产环境

用户于北京时间 2026-10-20 23:07 明确要求：固定正式地址，不使用测试站，只保留一个生产环境。此要求优先于历史 AGENTS.md 中的 Staging 强制流程。

## 固定地址与生产资源

- 唯一对家庭成员提供的正式地址：<https://hoooho.com/family-ray-home-life-workspace>。
- Railway 项目 `creative-nurturing`：`d8855fe3-c785-4b8c-825b-bdb10a941850`。
- 约定保留的唯一运行环境为 Production（测试服务尚待双重验证后停用）：`68b9b73f-1401-4658-a315-6d333ec31728`。
- 生产服务 `hoooho.app`：`aa308ba0-d7da-4771-9c94-ccdcd110f636`。
- 当前已验证生产部署 `5983d45f-a90b-43d4-b418-cae358bdee62`，源码 `e6d531a829adc88131563945ad3eab772f72921c`。
- 本轮只调整发布约定、CI 在线核验目标和测试服务资源；不更换生产二进制、域名、账号、密钥或数据。

## 发布规则

后续运行代码变更按本地核验、提交、同步主分支、Production 发布和线上核验执行。没有 Staging 发布环节，不再提供测试网址，也不再要求家庭用户在测试站登录或验收。保留必要的本地质量检查。历史报告中的 Staging 仅为历史记录。

## 测试服务停用状态

目标环境 Staging：`45ec5209-37a6-40f8-9697-a3ecd1347a80`。已准备的补丁 `d7ffddeb-666b-4d1b-8a33-cbe81962cd11` 仅停用下列两项服务：

1. `hoooho.app`（`aa308ba0-d7da-4771-9c94-ccdcd110f636`）在 Staging 的实例及测试域名。
2. `hoooho-calendar-verify-20261010`（`9fa8f4b9-352f-4dce-8ff1-f3e5f40a4c9e`）在 Staging 的旧验证实例。

不删除卷或桶。Staging 的 `hoooho.app-volume`（`3fbdf1a7-bd2e-4807-aa16-0f04fcdcf811`，500 MB）会解除服务挂载并保留为离线备份。生产环境的服务、数据卷挂载与正式域名保持现状。

**当前状态：PENDING_DASHBOARD_2FA，测试服务尚未实际停用。** Railway 在接受补丁时返回：`These staged changes require two-factor verification, which isn't available over an API/MCP token. Apply them from the Railway dashboard.`

需要所有者在 [Railway Staging 控制台](https://railway.com/project/d8855fe3-c785-4b8c-825b-bdb10a941850/service/aa308ba0-d7da-4771-9c94-ccdcd110f636?environmentId=45ec5209-37a6-40f8-9697-a3ecd1347a80) 应用这两项更改并完成双重验证。用户已经授权停用，无需再问是否允许；这是提供方要求的身份核验。应用后只保留 Production 运行，历史测试数据作为离线备份保留。不得绕过双重验证，也不得把“已准备补丁”写成“已停用”。
