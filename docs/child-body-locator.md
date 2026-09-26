# 儿童身体定位器 v1

本次能力接入健康随记的「记录症状」与已有症状记录编辑；其余共享 `BodyLocationPicker` 调用保持现有实现。

## 素材与坐标

`public/body-locator/v1/` 包含素材包十张原始 PNG，未重绘、镜像或拉伸。`src/features/body-location/child-data/` 保留原始字典、Schema、一级锚点、图集切片和来源 manifest。构建前 `test:body-locator-assets` 校验字节散列及词表覆盖：40 个一级区域、569 个条目，男孩适用 561、女孩适用 562，原字典明确文字显示 37 项。

`childBodyGeometry.ts` 明确原图尺寸、归一化范围、局部裁切与手足各个 panel。SVG 图像与覆盖层使用同一 viewBox。一级多边形按各模型/正反面锚点定位；精细点为人工核对的有限白名单，**不代表 569 项都有精确命中轮廓**。未标定、遮挡、文字项目与当前角度不可见项目仍可直接通过名称选择，保留结果而不画伪造点。拥挤点优先保留已选项；已选点彼此过近时保留文字反馈。图片尺寸或版本不匹配时禁用覆盖层，保留文字路径和重试入口。

## 业务契约

- 使用传入的确切 `memberId` 读取档案，`male/female` 映射为 boy/girl；未知值不默认男性。历史编辑使用记录所属孩子。
- 一级点击仅展开；二级名称直接切换草稿。正背面与手足辅助视角仅影响浏览。40 区域完整目录与分组列表同层滚动。
- 仅 `region_whole` 和 `region_uncertain` 与该区域具体选择互斥，整根不同手指可共存。打开旧记录不清理重叠数据。
- 确认写回；关闭取消；支持单项移除、清空后确认。沿用后端每条症状最多 20 个部位的上限并明确提示。
- 缺少性别时打开已有孩子编辑页面的新标签页，症状表单、附件与定位草稿继续留在原页面，返回后重新读取档案。
- 定位器的同 URL history 由 Router 初始化前的 dispatcher 明确接管，避免浏览器返回重挂载外层表单。无定位器所有权的普通导航照常交给 Router。

## 持久化与兼容

保持 `journal.symptom.locations` 原结构，增加可选 `schemaVersion`、`surface`、`coverage`、`modelAtSelection`。服务端验证新增枚举；旧客户端/旧记录仍可无这些字段。位置 ID 与版本共同区分新词表和碰巧同 ID 的旧记录。

历史转换保存原始位置快照，包括未知 ID、名称、侧别、原 `localRegion` 和 `markedArea`；不把旧坐标迁移成新插画精确点。手工部位文本与结构化位置同时保存并展示。原有器官与全身不明选择在同层保留，其他共享调用未替换。

## 可重复验收

```text
npm run typecheck
npm run test:client
npm run test:server
npm run test:journal
npm run build
npx playwright test --config tests/body-locator/playwright.config.ts
npx playwright test --config tests/time-view/playwright.config.ts --grep "confirmed symptom visual|failed symptom save"
git diff --check
```

定位器 E2E 使用临时本地数据目录和独立合成账号，覆盖 Chromium 模拟的 375×667、390×844、430×932、1280×900。截图输出 `outputs/body-locator/<environment>/<project>/`，失败 trace 见 `test-results/body-locator/`。真实手机需人工补验，不将浏览器模拟写成真机通过。

2026-09-27 本地验收：Client 533、Server 181（含已有 guest 前置测试）、Journal 22 均通过；构建、类型检查及冻结素材散列通过。定位器浏览器验收 10 项通过：完整闭环在四种视口各运行一次；完整男女词表遍历、首次保存、图片失败/档案补全、切换孩子隔离、旧数据回显在 SE 执行，其余尺寸的这些重复案例显式跳过共 18 项。另有现存症状页面回归 2 项通过，涵盖照片、补充信息与发生时间保留。仓库没有独立 lint 命令。

验收发现并修复新孩子第一次保存时 `JournalRecorder` 与 `NurseNextAction` 同层 React key 冲突：仅给记录表单 key 增加 `recorder:` 前缀，避免保存后残留不可操作表单；不改变时间轴业务或布局。

部署验收设置 `BODY_BASE_URL` 为当前环境域名、`BODY_EVIDENCE` 为环境名，执行 `node tests/body-locator/live-assets.mjs` 与上述 Playwright 命令。真实部署 HTML/JS/CSS/PNG 由线上获取；测试中所有业务 API 显式代理到隔离本地 fixture，直接 API 回读也明确使用本地地址，因此不会操作线上用户记录。这证明线上 UI 与实际服务契约配合，线上写入本身不宣称已验证。

## P-001 至 P-009 对应实现

| 项目 | 实现与证据 |
| --- | --- |
| P-001 | 原始十图、比例与源文件散列构建检查 |
| P-002 | 精确孩子档案、缺失资料补全、历史记录归属 |
| P-003 | 唯一完整词表、稳定版本与 ID、模型过滤、同层分组 |
| P-004 | 单定位器的两级状态、名称按钮与图上区域、44px 入口 |
| P-005 | 统一坐标裁切、分别标定、有限精细白名单、无锚点保留文字 |
| P-006 | 正背原图、左右图集、手掌/手背及足部四角度、标记显隐 |
| P-007 | 草稿复制、明确确认、取消回滚、空集合确认、保存再编辑 |
| P-008 | 可选字段兼容、原快照保留、旧文字与器官入口、共享组件保留 |
| P-009 | 四种视口、键盘返回、滚动可达、错误重试、触控高度与溢出检查 |
