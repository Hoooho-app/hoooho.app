# 健康时间线口语化文本压力测试

本专项只验证已经转成文字的口语内容，经用户可达的“文字记录”入口进入现有预览、确认、保存、事实整理和刷新展示链路。它不测试麦克风权限、ASR、音频上传、图片或 Vision，也不能被表述为真实语音测试。

- 正式分母：120 例，见 `cases.mjs`，执行前由 `cases.test.mjs` 冻结。
- 语义变体：20 例，独立统计，不进入正式分母。
- 环境：仅本地隔离 JSON 数据，账号域名为 `.invalid`，固定验证码只在该 Vite 测试配置中生效。
- 禁止：不得向 Production 写入数据，不得为通过案例而修改业务 Parser。

运行：

```bash
npm run test:timeline:oral-text
npm run prepare:timeline:oral-text
npm run dev:timeline:oral-text
```

UI 执行证据与原始结果写入被 Git 忽略的 `.artifacts/`，去标识化的结论与缺陷报告单独提交。
