# 底部导航固定高度与对齐

日期：2026-11-03（Asia/Shanghai）
基线：origin/main `3fae7dbfac327b1a27b403c8afb7a1789c8710de`；隔离分支 `codex/fixed-bottom-navigation-20261103`；初始工作树干净。

## 任务与验收

家长从症状记录切到健康日历、孩子档案再返回时，导航保持同一高度、同一底边；展开文字输入也不挤压导航。保持原导航项目、选中反馈、内容滚动、对话自动保留及一键整理业务。只改共享底导尺寸与首页承载方式，不改接口、模型、记录和原生包。

- 导航按钮行固定52px；导航总高为1px上边框 + 8px上间距 + 52px按钮行 + max(8px,底部安全区)。无安全区时总高69px。
- 共享高度同时用于档案/日历内容避让与首页内容避让，避免导航遮住输入或末尾内容。
- 首页导航绝对定位到其现有可视视口容器底部；容器保留原visualViewport键盘适配。选中、文字输入、短屏及路由懒加载不改变按钮行高度。
- 删除首页单独叠加8px安全区的覆盖；页面其他样式冻结。
- 本任务不产生业务数据；取消、返回及切换仍走原流程，未发送内容自动保留规则不变。

## 已执行验证

- `npm run build` 通过（含类型、图标、部位素材、头像、图片、视口、认证构建及安装配置检查）。
- 原 `TopLevelNavigation.contract.test.ts`：6/6通过；`git diff --check`通过。
- 真实Chromium浏览器，使用隔离本机合成账号、手机尺寸iframe加载实际产品路由。390×844下：症状记录、健康日历、孩子档案的导航均为 x=0,y=775,w=390,h=69,bottom=844；各按钮高52px。
- 320×568下：症状记录、孩子档案均为 y=499,h=69,bottom=568；文字输入真实展开后，footer bottom=499，与导航top=499相接，无遮挡。
- 预览仅有HTTP；测试启动页为该开发环境补齐randomUUID并注入本机合成会话，文件均在忽略目录，未改产品启动、生产认证或浏览器安全设置。健康日历该合成数据源显示读取失败；本轮仅验证导航及错误状态仍可切页，不声称验证了健康数据链路。
- 未在实体iPhone/Safari核验软键盘与Home Indicator安全区；不把iframe尺寸验证称为真机验收。

## 发布

产品主人已明确授权公开推送现有仓库并部署。

- PR #623已合入main，提交 `5482d8476249d18af2ba64ae68e524f848f9a0ab`。
- 同期排便表单修复随后合入main；已核对 `d4d982e57f7fe34a2199ec53e5916fa7d7abb66e` 包含本次导航提交，两处CSS与已验证源码一致。
- Production最终部署 `43389bfe-726d-47ed-a77c-059034ad3da4`（上述d4d982e）已观察到 **SUCCESS**。本次较早部署被后续构建取代，不把其REMOVED状态当作最终上线回执。
- 线上 `/api/health` 与 `/nurse-station` 均200。共享导航CSS `/assets/MainAppHeader-BngopaYs.css` 和首页CSS `/assets/nurseStation-D8PXZykT.css` 均200且逐字节匹配本地已验证构建。
- 两份CSS SHA256：`89868a2d11cf5b5e0a690d9239999a9e9889a0cb79179451701b4b1e4f795b0f`；`8e7b2f8bae5f67c94ba68486fb71bf304e0ac3461154cbc68c8a63f8c9a145f7`。
- 云端Frontdesk welcome verification完整通过（run 41519139863）；Smart record verification四组protocol通过，core的导航、草稿保留、语音/文字控件等相关步骤通过；归档时剩余更广泛回归仍在执行，未宣称整条Smart record流水线完成。
- 本地预览已停止；未创建Staging或重新打包iOS。线上未登录健康页面做真实资料读取/写入，线上验收范围为部署及实际资产，交互证据来自上述隔离数据的真实浏览器。
- 实体iPhone/Safari与产品主人视觉验收仍未执行。
