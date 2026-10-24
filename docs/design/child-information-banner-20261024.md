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

发布资产：`public/images/child-record-folder.2ea5d601b7.webp`，384 × 256，5,346 字节（约 5.2 KiB）。通过 Vite `?inline` 随首页模块内嵌，无独立图片网络请求。空状态横幅最小高度 120px，图片框高 96px。图片有明确尺寸、eager/high 首屏优先级，文本与按钮无需等待图片解码；不挂载护士视频。既有非空状态横幅尺寸与视频不变。

生成提示：

> A compact polished soft 3D editorial illustration for a child health recording app: an ivory record folder with a friendly East Asian toddler portrait, two rounded diary cards tucked behind, and a moss-green pen. A single clear still-life cluster on seamless pure white; landscape 3:2, legible at small mobile banner size. Smooth matte surfaces, soft studio shadows, ivory/sage/moss and a small apricot accent. No paper grain, text, letters, numbers, logos, watermark, nurses, doctors, medical crosses or UI chrome.

## 验证与发布

- `npm run build` 通过：含 TypeScript、版本化图片预算、Vite、视口、登录构建与安装配置检查。
- `HealthEvents.contract.test.ts` 13 项通过；现有首页浏览器流程通过，保留有孩子后的原护士视频、导航和入口。
- 独立临时数据中的实际浏览器操作通过：注册后零成员首页、进入添加表单、空表单返回、添加虚构孩子并回到原护士首页。
- 320/375/390/430px 均无水平溢出；空状态横幅实测 122px（含边框），主按钮 50px。内嵌 WebP 解码 384 × 256，独立图片请求 0、空状态视频请求 0、页面错误 0。
- 首页实测背景 `rgb(244, 242, 237)`，`background-image: none`。未进行实体 iPhone Safari 验收。
- 只读视觉复核无阻断项，不代表产品主人验收。

首版已通过 [PR #508](https://github.com/Hoooho-app/hoooho.app/pull/508) 合并为 `74ee932115c85921194489f9a55ef0b348796554`，Production 部署 `fbaed922-e09f-4e90-95c4-aea7332c0e2c` SUCCESS。实际 `/api/health` 正常；公共 WebP HTTP 200、5,346 字节，SHA256 与原资产一致。

随后加载优化以该 main 为基线：图片从相对文件路径使用 Vite `?inline` 导入，保留公共源资产以兼容已打开页面。最终构建中 WebP 是 data URL，解码字节与源文件相同；最终构建、13项契约和完整临时浏览器流程再次通过，未改全局构建阈值。该加载优化的最终 Production 发布与线上核验回执记录在对应 PR 中。

视觉方案等待产品主人实际查看与评价。

## 最新调整：手机拍摄个人信息报告单

- 基线 `28ea992c7eaa22a9ca26de4570bbaae577c0cc1f`，分支 `fix/report-camera-banner-20261024`，开始时工作区干净。
- 按产品主人要求，将零成员首页插画改为正规资料报告单：含个人信息栏、记录行和表格，一部手机对着单据拍照。延续原插画柔和立体、白色和灰绿色的风格。
- 只替换版本化图片及准确的替代文本；保留内嵌加载、紧凑横幅、页面文案、“添加孩子信息”、表单与返回行为、浅色无纹理背景、有孩子后的原护士视频。无 API、数据、AI 或依赖变更。
- 验证构建与图片预算、320/375/390/430px 图片清晰度与布局、内嵌解码和零独立图片／视频请求、添加及返回流程；随后提交、合并 main、Production 发布与线上复核。实体 iPhone Safari 不在本轮已验收范围内。

## 首页初始化：对话式添加第一个孩子

最终分支为 `feat/first-child-dialogue-20261024`，基线仍为 `28ea992c7eaa22a9ca26de4570bbaae577c0cc1f`。

合并前已同步最新正式分支 `952ff45c1abb928539690f8f78ede82c1f8f710f`，保留同期登录方式与导航改动；在此基线上重新构建并核验引导流程。原首页测试同步此基线已移除侧栏“设置”的导航预期，本轮不修改侧栏实现。

产品主人将同一轮范围扩展为首次使用引导：首页无孩子时直接提问，按姓名／出生日期／性别／与孩子的关系收集；然后预览资料及卡通头像，允许修改单项、换头像，明确确认后创建孩子并进入既有记录首页。从侧栏或直接访问 `/family/new` 添加首孩也进入同一引导；第二个孩子保留原结构化表单。

- 复用 `NurseMessage` 通栏气泡、`DialogueComposer` 的语音／文字输入、原生日期选择及快捷回复。共享输入组件仅将 `onPhoto` 改为可选：本初始化不显示无用途的附件按钮，既有调用保持原状。
- 复用账号级 ASR（无需孩子ID）、现有生日与姓名校验、`familyMemberService.create`、`ChildAvatar` 和年龄／性别头像规则。资料收集使用明确字段，不新增 AI 提取、健康事件、API、数据结构或依赖。年龄模糊回答不猜测生日，仍需准确年月日。生日沿用原有未满8周岁的规则。
- 草稿与待识别语音按账号、问题分区。确认前无成员写入；确认按钮同步锁定防连击；每次创建前先读取真实成员，核对上次请求结果是否已保存。读取失败不会继续创建。成功响应仅回写仍在当前账号的页面。
- 前四步可刷新继续，核对后修改单项回到核对，头像同步生日／性别并可换一个。成功后清理本轮草稿及语音并选择已保存孩子。
- 文字／语音方式随步骤保留，核对区获得无障碍焦点；有待恢复录音时停用新录音，提供重试／删除。资料写入请求共用取消信号，离开页面或切换账号时立即取消，防止旧账号资料在新会话下重试。
- 新图：`public/images/child-record-report-camera.8076af1b81.webp`，384 × 256，7,908字节，通过相对文件 `?inline` 随首页加载。图中为信息报告单和手机拍照取景；原图保留兼容已打开页面。原有正常首页护士视频不变。
- 内置 imagegen 提示：沿用原图的柔和3D、象牙白和灰绿色、白底光影，将主体替换为正规的儿童个人信息报告单（姓名、年龄、日期栏及规整表格），手机对准纸张拍照，屏幕呈现对应报告和取景框／快门。画面紧凑、无真实个人信息、无医院标识或装饰贴纸。

本轮验收增加：逐项回答与生日纠错、头像核对和修改、语音与麦克风拒绝后的文字输入、刷新恢复与账号隔离、保存失败重试／丢响应恢复／双击不重复、首孩直接入口和第二孩表单。构建、客户端及浏览器结果、Production 回执记录在对应变更 PR 中；AI 复核不代表产品主人验收。
