# 手机前台护士形象替换 · 2026-10-25

- 基线：`origin/main` / `3c3993b1d9aa6ebd1634f3c1ab0d153bdd8e7eb1`，独立分支 `codex/masked-front-desk-nurse-20261025`，开始时工作区干净。
- 用户要求：手机前台改用提供截图中的护士形象，并让她戴上口罩。
- 范围：仅前台欢迎区，保留棕色短发、薄荷绿制服、挥手和夹板；使用透明图片，口罩覆盖口鼻。
- 冻结：欢迎文案、布局、对话和记录流程、共享聊天头像、原视频、其他页面、API 和数据。

## 验收清单

- [x] 根据用户截图制作戴口罩的透明护士图片。
- [x] 欢迎区引用新版本图片，替代旧欢迎图；保留原有尺寸和 `object-fit: contain`。
- [x] 更新两处现有浏览器验收的图片引用。
- [x] 完整构建通过；操作现有前台响应式流程和首孩进入前台流程。
- [x] 实际查看 320px、390px 手机截图，确认人物完整、透明背景、口罩清晰、无布局遮挡。
- [ ] 提交、推送、合入 main，Production 部署成功并核验线上资源。

## 图片来源与制作

用户提供：`image(20261025-101322).png`。使用内置图像编辑工具制作，保留人物特征并添加医用口罩。原始生成图保留在本次工作区的 `generated_images/exec-c0d412ff-3d6b-46e2-b040-369a26b5615d.png`；运行时仅引用压缩后的透明 WebP。

实际提示词：

```text
Use case: identity-preserve
Asset type: transparent cutout character asset for the mobile front desk of an existing healthcare app.
Input image 1 is a screenshot. Edit target: ONLY the small stylized 3D female nurse visible at the upper left of the phone screen. Extract and faithfully recreate THIS SAME nurse as a clean isolated transparent-background image at high resolution. Preserve her short side-parted chestnut brown bob haircut, large warm brown eyes, youthful rounded face, proportions, mint green short-sleeved scrub uniform with white V-neck trim, friendly standing pose, raised waving right hand (on viewer's left), and pale clipboard held by her left arm (on viewer's right). Show from head to lower hip, entire raised hand visible. Add ONLY a well-fitting light mint medical surgical face mask covering nose and mouth with ear loops, matching her uniform; keep the eyes clearly visible and friendly. Match the soft polished 3D illustration style and original character identity. No hat. No additional character or props. No screenshot, phone frame, UI, background, text, letters, logos, shadows on a floor or watermark. Center the nurse with tight useful transparent margins for production UI. True transparent alpha background.
```

## 验证与发布

- 运行时素材：`src/assets/nurse-triage/front-desk-welcome-masked-20261025.webp`，531×640，45,658 字节，保留透明 alpha。
- `npm run build`：通过，包含类型检查、图片资产、viewport、auth-build 和安装配置检查。
- 现有前台浏览器流程：2/2 通过，覆盖 320/375/390/430/620/1280px、导航和聊天历史。
- 现有首孩浏览器流程：1/1 通过，完成首孩记录后进入新护士欢迎区。
- 人工查看 `home-320.png` 与 `home.png`（390px）：人物、口罩、挥手和夹板清晰完整，透明图片与欢迎区背景融合，无横向溢出或遮挡。
- 独立只读审查和 `git diff --check`：通过。没有修改布局、文案、原视频或业务流程。
- 发布与线上核验：待发布后补记。

浏览器手机尺寸模拟不代表 iPhone Safari 真机验收，也不代表产品负责人视觉验收。
