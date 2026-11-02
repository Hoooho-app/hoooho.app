# 首页记录单直角上沿 · 2026-11-02

基线：`Hoooho-app/hoooho.app`，干净 `origin/main` 的 `a5fc915a5be9c5c38a469e70b5ed02b5baa8738a`；分支 `codex/record-square-top-20261102`。

## 范围与验收

- 已有症状记录时，首页“症状记录单”入口左上、右上为直角，保留原下方圆角；去掉入口容器顶部8px空隙，上沿直接贴在原横线下，入口高度和点击处理不变。
- 气泡内白色记录单左上、右上为直角，保留下方原小圆角。绿色气泡、保存说明、白底、内容、折叠、查看与编辑维持原行为。
- 不改独立弹层记录单的圆角、不改就诊清单圆角，不改数据、API、AI、归属或保存协议。
- 普通案例：家长在首页完成既有记录保存 → 看到贴线入口和气泡白色单据 → 点击入口查看同一记录 → 返回并编辑保存。仅CSS变化，失败/重试、切孩子、返回/刷新与持久化沿用现有实现；不新增异步副作用。
- 手机浏览器核对375/390/430px及320px窄屏，无横向溢出；模拟浏览器不等同实体iPhone验收。视觉最终验收仍由产品主人完成。

## 实现

仅 `src/pages/NurseStation/conversationHome.css` 三条规则：入口容器顶部padding为0，record入口和气泡内单据使用上角0、下角沿用V2 token。

## 验证与发布

- PASS：`npm run build`，包含TypeScript、图标/图片素材、viewport、auth-build与安装配置检查。
- PASS：既有 `tests/front-desk-continuous/front-desk.spec.ts` 的 `key information: paper home` 用例，375/320/390/430px四项目共4项通过。覆盖真实本地页面、生成/保存、同ID编辑、刷新重开、入口查看和横向溢出检查；供应商为合成响应，无真实模型调用或正式健康数据写入。
- 已查看375px实际页面截图：标签直角上沿与横线贴合，白色单据上角直角；未取得实体iPhone与产品主人视觉验收。
- PASS：`git diff --check`。本轮仅样式与本交付记录，不新增测试文件；不适用独立API/数据迁移测试，仓库无独立lint脚本。
- Production部署回执在取得后补充；沿用既有main自动发布，不创建Staging、不重打iOS包。
