# 护护记录接入 OpenRouter

接入代码与实际启用是两个阶段。没有配置新 Key/模型时，现有百炼服务继续按原配置工作；本文件不表示真实模型效果已经验收。

## 负责人需要完成的账号步骤

1. 在 [OpenRouter](https://openrouter.ai) 注册/登录。先确认所选模型对真实使用地区和账号开放；聚合平台不取消模型厂商的地区限制。
2. 从模型目录复制固定的 `provider/model` ID。文本模型须支持 JSON Schema；处理图片时还须支持图片输入，可另设视觉模型。不要选择自动路由做模型对照。
3. 在 [额度页面](https://openrouter.ai/settings/credits) 按结算页面实际可用方式小额购买额度；官方列有支付宝和银行卡。先验证最低额度，不默认开启自动充值。
4. 在 [API Keys 页面](https://openrouter.ai/settings/keys) 新建 `Hoooho` Key，设置调用额度上限。完整 Key 只填到后端环境变量，不发聊天、不写 GitHub、不放浏览器配置。

官方依据：[支付方式](https://openrouter.ai/pricing)、[API 接入](https://openrouter.ai/docs/quickstart)、[结构化输出及模型能力](https://openrouter.ai/docs/guides/features/structured-outputs)、[模型限制条款](https://openrouter.ai/terms)。

## 当前后端配置位置

Railway 项目 `creative-nurturing` → 服务 `hoooho.app` → `production` → Variables。确认是健康服务，不改独立家庭服务。

先增加以下变量，保留当前 `AI_PROVIDER`，这样不会提前切换流量：

| 变量 | 填写内容 |
| --- | --- |
| `OPENROUTER_API_KEY` | 新建的 Key，作为服务端密钥 |
| `OPENROUTER_MODEL` | 账号和地区可用、支持 JSON Schema 的固定模型 ID |
| `OPENROUTER_VISION_MODEL` | 可选，支持图片和 JSON Schema 的模型 ID；不填则使用文字模型 |

`ASR_PROVIDER`、`TTS_PROVIDER` 和原 `BAILIAN_*` 保留。旧 `AI_MODEL` / `AI_DRAFT_MODEL` / `AI_VISION_MODEL` 不覆盖显式 OpenRouter 模型。服务只向官方 `https://openrouter.ai/api/v1` 发出模型请求。

准备好后，由执行者检查配置并将 `AI_PROVIDER` 改为 `openrouter`，完成 Production 部署和真实模型验证。配置缺失、余额不足、权限/地区限制均明确失败，不自动换模型、重试或充值。不要在未完成账号步骤时先改开关。

## 验证与恢复

- 对照使用相同原话、历史和提示词。检查回复是否理解最新补充/改口、追问是否重复、整理是否引用原话、用户编辑是否保留、保存是否有真实回执，不能只比较措辞是否自然。
- 后端诊断记录 `provider=openrouter`、明确模型 ID、请求标识及 token 数，前台消息和草稿来源沿用它。合成测试只能证明适配与业务边界，不能证明模型语义质量。
- 本接入覆盖文字与图片模型调用。语音转文字、朗读和实时音频仍是独立供应商配置，不把它们报告成已经切换。
- 需要回退时，将 `AI_PROVIDER` 恢复为 `bailian` 并部署。原百炼变量不删除；已有原话、原件、草稿与正式记录不因切换重建。

本任务实施与证据见 [接入任务契约](delivery/openrouter-provider-20261029.md)。
