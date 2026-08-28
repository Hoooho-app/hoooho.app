# 使用说明动态教程素材

目录约定：

- `tutorials/scenarios/core-tutorials.json`：核心流程、画面顺序与停留时间。
- `.codex-tmp/tutorial-recordings/<scenario-id>/`：本地录制帧，不提交 Git。
- `public/tutorials/recordings/`：页面使用的 VP9 WebM。
- `public/tutorials/posters/`：视频加载前、失败或减少动态效果时使用的 WebP 封面。
- `src/features/guide/tutorials.ts`：标题、关键词、步骤、跳转地址和媒体地址。

重新录制时，使用独立测试账号和虚构数据，在 iPhone SE 竖屏视口按场景清单走真实产品流程，并把无浏览器边框的页面截图按清单文件名保存。禁止录入真实姓名、邮箱、验证码或健康信息。

编码命令：

```powershell
$env:FFMPEG_PATH = 'C:\path\to\ffmpeg.exe'
node scripts/tutorials/encode-tutorial-media.mjs
```

编码完成后检查三个 WebM 均可循环播放，poster 尺寸为 375×667，并重新运行页面测试与 Production Build。

多尺寸、控制台、减少动态效果和媒体失败降级可通过 `scripts/tutorials/validate-guide-page.mjs` 重复验证。脚本依赖 Playwright，并接受以下两种隔离登录方式：

- `GUIDE_STORAGE_STATE`：指向 Playwright 测试账号的 storage state 文件。
- `GUIDE_BOOTSTRAP_PATH`：指向仅在本地存在、完成测试账号登录后跳转 `/guide` 的引导页。

两者均不得提交账号、验证码、Token 或真实健康数据；未提供时，脚本会直接访问页面，适合无登录保护的测试环境。
