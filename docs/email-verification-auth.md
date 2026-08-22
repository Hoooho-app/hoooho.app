# 邮箱验证码登录

Hoho 当前默认使用邮箱验证码登录，同时保留原手机号认证 API 和 phone-only 用户数据兼容。

## API

- `POST /api/auth/email/send-code`，请求体：`{ "email": "user@example.com" }`
- `POST /api/auth/email/login`，请求体：`{ "email": "user@example.com", "code": "123456" }`

邮箱在服务端统一执行 `trim` 和小写标准化。首次验证成功会创建账号及“我”家庭成员；同一标准化邮箱后续复用同一账号。

原手机号接口 `/api/auth/send-code` 与 `/api/auth/login` 保留，但当前登录页不调用。

## 环境变量

- `RESEND_API_KEY`：Resend API 密钥，必须作为 secret 配置。
- `AUTH_EMAIL_FROM`：Resend 已验证的发件地址，例如 `Hoooho <login@example.com>`。
- `AUTH_TOKEN_SECRET`：会话签名密钥，必须作为 secret 配置。

缺少 Resend 配置时，发送接口返回 `EMAIL_PROVIDER_NOT_CONFIGURED`，不会把验证码输出到控制台，也不会保存可用于登录的验证码。

这些变量必须按 Railway Environment 隔离配置，不得提交到 Git。Staging 与 Production 使用不同的 `AUTH_TOKEN_SECRET`。

## 发布策略

Hoho 尚未正式对外开放时，邮箱验证码登录采用快速 Production 迭代：

1. 完成自动化测试、类型检查和 Production build。
2. 确认 Railway Production 已配置 `RESEND_API_KEY`、`AUTH_EMAIL_FROM`、`AUTH_TOKEN_SECRET`，并确认发件地址已获 Resend 允许。
3. 提交、推送并按项目现有流程部署 Production。
4. 部署完成后进行线上真实邮箱验收。

当用户明确宣布已有陌生用户或正式外部用户进入后，切换为 Staging-first：开发 -> 隔离 Staging -> 真实邮件验收 -> Production。现有 Railway Staging 环境继续保留；当前快速模式不以 Staging 公网 DNS 完成度作为 Production 阻塞项。

## 安全约束

- 6 位随机数字，5 分钟有效，60 秒内不可重发。
- 验证码只保存带随机 salt 的 SHA-256 摘要，成功后一次性消费。
- 连续错误 5 次后当前验证码失效。
- 邮箱与手机号验证码按 `channel + identifier` 隔离。
- 邮件 provider 成功后才保存验证码；发送失败不会留下有效验证码。
- 邮箱日志只使用脱敏值，禁止记录验证码明文。
