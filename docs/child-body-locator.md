# 儿童身体定位器 v2

按 2026-10-01 TXT 第二次修订实现。范围为「记录症状」、症状历史编辑与回显、就诊情况单的部位表达和必要的保存兼容；其他共享 BodyLocationPicker、AI 解析、成员资料、时间轴业务及已有护士素材不变。

## 交互与状态

- 40 个原始区域合并为统一大类，左右身体入口进入同一大类；双侧部位不默认左右。编辑已选名称时恢复可靠 ID 对应的左右与表面。
- 固定导航、左右、真实视角、图与两侧入口；独立抽屉承载更多部位、当前区域文字选项、全部已选。底栏只显示数量、最近名称和完成按钮，0/1/20 项不改变高度。
- 手掌/手背和足部四张实际图集切片独立切换，不叠加全局正背控制。其他区域仅显示原图支持的正面/背面，缺少侧面素材不伪造侧视图。
- 图上使用曲线路径，不用浮动矩形或编号点。小目标先局部放大，名称按钮与文字抽屉为 44px，显示完整可读名称，字号 14px。
- 粗选与精细选择共存；粗选明确写「具体位置待补充」，左右不明的粗选另外保留左右未指定语义。手工位置仍单独保存于 locationText。
- 只有完成才提交。改动后关闭、取消、Esc、系统返回退出时确认放弃；区域返回、视角切换、抽屉收起不丢草稿。清空有独立确认。会话捕获确切成员，认证刷新不重置草稿，切换成员不提交旧成员选择。
- 主表单和抽屉后的背景 inert，抽屉管理焦点并恢复；图片失败保留名称入口与重试，档案失败保留缓存/中性图和草稿。沿用每条症状 20 项上限。

## 素材与几何

原始十张 PNG、569 项词典及原始坐标文件保留于 v1；`test:body-locator-assets` 校验原始字节散列。男女分别适用 561/562 项，完整文字抽屉遍历不能替代图形标定。

`locatorGeometry.ts` 是 v2 曲线路径白名单。全身图只裁去外侧白边，保持比例，未修改/镜像/拉伸原图；图像、轮廓、命中和引线都变换到同一裁切坐标。一级轮廓表示可见的大部位范围。局部标定包括各正背面头皮、手掌中心与两侧掌垫、各指掌背面、手背、左右足背/底与实际足侧面、可见四肢前后表面；左右足底分别量测边缘。中性模型有独立一级锚点，不套用男女精细面部坐标。

**素材边界：**衣物覆盖的胸腹背等细节、乳头/脐点、黏膜、精细关节/甲襞、未露出的内外侧边界仍通过具体名称选择；本次没有声称 569 项都有图上轮廓。膝内外侧缺少对应局部原图，不制造新视角；中性面部缺少高分辨率局部图，保留明确文字项。男/女面部小目标和手指/脚趾可局部放大。地图是记录用体表示意，不是诊断或深部解剖图。

`public/body-locator/v2/neutral-front.png`、`neutral-back.png` 通过内置 imagegen 根据原始男女图生成，并单独检查 1024×1536 尺寸与 SHA256。未知性别使用中性图及男女词典共同适用项，不猜测性别，也不要求补档案才可继续。没有更改 v1 图。

生成提示：正面「same cute softly rendered 3D Hoooho child style; gender-neutral three-year-old, short brown hair, mint shirt, cream shorts, bare feet, symmetric A pose, white background, full body, no text; 1024×1536」。背面使用生成正面和原男孩背面作参考，要求同一儿童、同姿势与尺寸，直接背面、手背与脚跟可见、无文字。工具为 builtin imagegen，未使用额外 API 密钥。

### 小屏入口分配

实际 DOM 量测见 `outputs/body-locator/<environment>/<project>/layout.json`。按钮高 44px、间距 4px，计算两列能容纳的行数；主要入口优先，剩余类别进入更多部位，抽屉不重复当前两侧入口。图片使用余下中间宽度并尽量裁去白边。

| 验收视口 | 全身图片区可用宽×高 | 两侧入口 | 首先进入更多的补充类别 |
|---|---|---|---|
| 320×568 | 296×313 | 10 | 上臂、肘、前臂、小腿、腕、踝、耳、髋、腋下等 |
| 375×667 | 351×412 | 14 | 腕、踝、耳、髋、腋下、腹股沟、外生殖器、会阴及当前背面类别 |
| 390 宽 | 366×409 | 14 | 与 SE 相同容量 |
| 430 宽 | 406×485 | 18 | 腋下、腹股沟、外生殖器、会阴及当前背面类别 |

320 的首屏保留头、面部五官、颈、肩、胸、腹、手、大腿、膝、足。局部图有独立的 44px 左右与视角栏，其可用高度少于全身图；未放入两侧的细项仅在「用文字选择」中出现。没有缩小字号或缩小点击热区来塞入所有 569 项。

## 保存、标签与旧记录

沿用 `journal.symptom.locations` 与原 ID/原词表 schemaVersion=1.0.0，增加可选 dictionaryVersion=2.0.0、regionId、categoryId、precision、displayLabel、medicalLabel。bodySide 表示孩子自身方向，surface 表示实际表面；modelAtSelection 增加 neutral。服务端验证新增字段和枚举，旧记录缺少字段仍可保存。locationNumber 保留为兼容的内部顺序，不作为名称显示，也不生成新的编号 markedArea。

表单、历史摘要及就诊情况单共用 `shared/body-location-label.mjs`。有可靠 ID 的旧编号名称使用词典名称，有清楚原文的名称去掉编号；只有不可靠数字位置时保留原文并标记位置待补充。不根据坐标/数组位置猜侧别。原 ID、原标签、原 localRegion、markedArea 坐标、已支持字段的原始快照和手工文字保留，打开不做破坏迁移。不同左右/表面不会合并。

## 验收与发布

```text
npm run typecheck
npm run test:client
npm run test:server
node --test server/events/journal-metadata.test.mjs server/visit-sheets/*.test.mjs
npm run build
npx playwright test --config tests/body-locator/playwright.config.ts
npx playwright test --config tests/time-view/playwright.config.ts --grep "confirmed symptom visual|failed symptom save"
git diff --check
```

定位器 E2E：完整保存/编辑和固定工作区在 SE、320、390、430、桌面各运行；男女 40 区全部 561/562 项、图片/档案错误、中性图、浏览器返回与 Esc、切换孩子、历史原文兼容在 SE 运行；20 项抽屉与轮廓叠加在 SE 和 320 运行，其余重复案例明确跳过。失败保存保留症状、部位、时间、照片和补充信息。真实手机待人工验收，浏览器模拟不写成真机通过。

部署检查使用真实 HTTPS HTML、JS/CSS 和十二张图，散列对照本地构建；`BODY_BASE_URL` 指向已核实环境。浏览器业务 API 全部显式代理到本地合成账号/临时数据目录，保存回读也使用本地 API；不操作线上患者记录，不宣称完成真实线上账号写入验证。

2026-10-01 本地：Client 549 PASS；Journal + VisitSheet 55 PASS；guest 前置 21 PASS；Server 184 中 183 PASS，唯一既有 Operations 日期用例 FAIL（未改源码，9月1日失败快照在10月1日超过30天保留窗；不改测试断言，固定 fixture 时间到9月27日重跑原 Ops 11 项均 PASS）。该失败与定位器、存储/API 新字段及报告无依赖关系，未修改 Operations。

定位器本地浏览器 18 PASS、27 个有说明的重复案例跳过；TypeScript、构建、素材、viewport/auth/install guard 与 diff check PASS。仓库没有独立 lint 命令。最终部署 ID、commit、域名、HTTP/资源和功能结果记录在本次 `outputs/body-locator/acceptance-v2.md`。
