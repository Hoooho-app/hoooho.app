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
- 图片入口只存在于第一条记录表单。浏览器会校正方向、缩放、压缩并去除元数据；HEIC 在浏览器支持解码时安全转码，否则给出可操作提示。
- 图片先进入短期草稿预检。服务端校验真实 MIME、可解码性、字节数和像素数；无关、不安全、不可用或分析失败的图片不会创建正式记录或事实。
- 服务端已提供真实音频字节的 ASR 适配器与 WAV 回归测试；现有浏览器快捷记录仍使用 Web Speech API，不上传原始音频。
- 没有真实 Vision/ASR 凭据、浏览器麦克风权限或对应设备时，相关真实 E2E 必须保持 `BLOCKED`，不能用文本或模拟响应冒充通过。

这些边界必须在报告中标记为 `BLOCKED` 或 `FAIL`，不能绕过 UI 直接调用最终写入接口后声称 E2E 通过。
