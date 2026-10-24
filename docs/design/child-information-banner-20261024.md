# 首次添加孩子：轻量图片横幅

## 范围与验收

- 基线：`93493832a66b6b79441945a7175633392e01e8ef`，分支 `fix/child-information-banner-20261024`，开始时工作区干净。
- 仅修改尚未添加孩子时的护士站首页。顶部横幅使用表达孩子资料与日常记录的静态插画，保持紧凑。
- 主入口文案改为“添加孩子信息”；沿用现有 `/family/new` 与 `firstUseEntry` 参数，不修改表单、数据或 API。
- 保留浅色纯色背景、无纹理。有孩子后的护士视频、对话、侧边栏和其余页面不变。
- 首屏图使用独立压缩 WebP、版本化文件名及明确尺寸；目标小于 30 KiB，不加载该空状态不需要的护士视频。实际时延随网络而变，不承诺任意网络固定毫秒数。
- 验证构建、受影响文案契约、320/375/390/430px 空状态布局、图片加载与无视频请求、添加与返回流程、有孩子首页原视频。
- 完成提交、远端检查、合并 main、Railway Production 发布及线上资源核验；浏览器模拟不等于实体 iPhone Safari 验收。

## 图片

内置 imagegen 生成，面向当前项目的静态插画。构图为白底小型孩子资料夹、幼儿照片、日常记录卡与绿色笔；鼠尾草绿、象牙白和少量杏色，柔和立体光影，无文字或医疗符号。网页标题保留可访问的 HTML 文本。

发布资产：`public/images/child-record-folder.2ea5d601b7.webp`，384 × 256，5,346 字节（约 5.2 KiB）。空状态横幅最小高度 120px，图片框高 96px。图片有明确尺寸、eager/high 首屏优先级，文本与按钮无需等待图片解码；不挂载护士视频。既有非空状态横幅尺寸与视频不变。

生成提示：

> A compact polished soft 3D editorial illustration for a child health recording app: an ivory record folder with a friendly East Asian toddler portrait, two rounded diary cards tucked behind, and a moss-green pen. A single clear still-life cluster on seamless pure white; landscape 3:2, legible at small mobile banner size. Smooth matte surfaces, soft studio shadows, ivory/sage/moss and a small apricot accent. No paper grain, text, letters, numbers, logos, watermark, nurses, doctors, medical crosses or UI chrome.

## 验证与发布

- `npm run build` 通过：含 TypeScript、版本化图片预算、Vite、视口、登录构建与安装配置检查。
- `HealthEvents.contract.test.ts` 13 项通过；现有首页浏览器流程通过，保留有孩子后的原护士视频、导航和入口。
- 独立临时数据中的实际浏览器操作通过：注册后零成员首页、进入添加表单、空表单返回、添加虚构孩子并回到原护士首页。
- 320/375/390/430px 均无水平溢出；空状态横幅实测 122px（含边框），主按钮 50px。WebP HTTP 200、解码 384 × 256，空状态视频请求 0，页面错误 0。
- 首页实测背景 `rgb(244, 242, 237)`，`background-image: none`。未进行实体 iPhone Safari 验收。
- 只读视觉复核无阻断项，不代表产品主人验收。

发布与线上核验随后补充。视觉方案等待产品主人实际查看与评价。
