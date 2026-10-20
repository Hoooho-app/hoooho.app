# 家庭统筹会：唯一正式地址与单生产环境

用户于北京时间 2026-10-20 23:07 明确要求：固定正式地址，不使用测试站，只保留一个生产环境。此要求优先于历史 AGENTS.md 中的 Staging 强制流程。

## 固定地址与生产资源

- 唯一对家庭成员提供的正式地址：<https://hoooho.com/family-ray-home-life-workspace>。
- Railway 项目 `creative-nurturing`：`d8855fe3-c785-4b8c-825b-bdb10a941850`。
- 唯一运行环境为 Production：`68b9b73f-1401-4658-a315-6d333ec31728`。Staging 测试服务已停用。
- 生产服务 `hoooho.app`：`aa308ba0-d7da-4771-9c94-ccdcd110f636`。
- 建立本约定时已验证生产部署 `5983d45f-a90b-43d4-b418-cae358bdee62`，源码 `e6d531a829adc88131563945ad3eab772f72921c`；后续运行版本按各功能发布记录追踪。
- 本次 Staging 停用只调整测试服务资源及停用记录，未变更生产配置、域名、账号、密钥或数据，也未触发生产发布。

## 发布规则

后续运行代码变更按本地核验、提交、同步主分支、Production 发布和线上核验执行。没有 Staging 发布环节，不再提供测试网址，也不再要求家庭用户在测试站登录或验收。保留必要的本地质量检查。历史报告中的 Staging 仅为历史记录。

## 测试服务停用状态

目标环境 Staging：`45ec5209-37a6-40f8-9697-a3ecd1347a80`。补丁 `d7ffddeb-666b-4d1b-8a33-cbe81962cd11` 已经通过已登录的 Railway 网页完成环境名称确认并应用，仅停用下列两项服务：

1. `hoooho.app`（`aa308ba0-d7da-4771-9c94-ccdcd110f636`）在 Staging 的实例及测试域名。
2. `hoooho-calendar-verify-20261010`（`9fa8f4b9-352f-4dce-8ff1-f3e5f40a4c9e`）在 Staging 的旧验证实例。

未删除卷或桶。Staging 的 `hoooho.app-volume`（`3fbdf1a7-bd2e-4807-aa16-0f04fcdcf811`，500 MB，ams）已解除服务挂载并保留为离线备份。生产环境的服务、数据卷挂载与正式域名保持现状。

**当前状态：RETIRED_VERIFIED，已于北京时间 2026-10-20 23:23 实际停用。**

完成证据：

- Railway 网页的 Staging 架构只显示未挂载的数据卷，不再显示服务或待应用变更。
- `describe-environment` 复核：`services: []`、`staged: null`、备份卷 `state: live` 且 `mountedOn: null`。
- Production 复核：保留 `hoooho.app` 服务及其 `/data` 卷挂载，无待应用变更。

Staging 环境记录仅用于保存历史离线数据卷，不包含运行服务，不再作为发布、登录或验收环境。API 先前要求转到网页应用破坏性补丁；本次按网页正常确认流程完成，没有关闭或绕过身份验证保护。后续不得恢复测试服务，除非用户明确要求。
