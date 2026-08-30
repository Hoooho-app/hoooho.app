# 健康时间轴多模态专项测试资产

本目录只服务普通健康事件详情页的时间轴列表与底部快捷记录，不触碰智能查看、护士导诊台或护士动画。

## 执行

```powershell
npm run fixtures:timeline:multimodal
npm run prepare:timeline:multimodal
npm run dev:timeline:multimodal -- --port 4179 --strictPort
npm run test:timeline:multimodal
```

`cases.mjs` 是 52 个专项用例的唯一清单。结果必须分别归类为真实语音 E2E、受控音频 E2E、转写后文本链路、图片 E2E和图片+语音 E2E，不得合并出一个虚假总通过率。

生成器只创建合成数据，输出到本目录下被 Git 忽略的 `fixtures/`。其中音频依赖 Windows SAPI；如果当前机器没有可用中文语音，生成器会明确失败，不能把文本文件冒充音频。

本地 E2E 使用 `timeline-e2e@example.invalid` 和固定验证码 `123456`，只对 `.artifacts/data` 生效；测试配置的邮件提供器不会联网或发送真实邮件。

## 重要能力边界

- 普通时间轴已有记录后的底部快捷记录当前只有浏览器 Web Speech API 与文字回退，没有照片入口。
- 图片入口只存在于第一条记录表单，支持 JPG、PNG、WebP，单张上限 5MB。
- 当前前端没有 HEIC 支持或自动压缩。
- Web Speech API 不上传原始音频，自动化环境无法用文本冒充咬字不清、背景噪声或多人重叠的真实 ASR 测试。

这些边界必须在报告中标记为 `BLOCKED` 或 `FAIL`，不能绕过 UI 直接调用最终写入接口后声称 E2E 通过。
