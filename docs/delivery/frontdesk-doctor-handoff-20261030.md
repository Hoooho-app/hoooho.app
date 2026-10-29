# 首页就诊交接场景配图

基线 `572c9ead26b0ce6f1dd46c5387874d20023b56be`；分支 `codex/frontdesk-doctor-handoff-20261030`。用户已确认妈妈背面举手机、医生正面做OK手势、手机浮出情况单气泡的预览，明确要求实现。

## 本次契约

家长打开空白首页，欢迎张停留10秒后，通过原马赛克过渡看到就诊张：文案仍为“一键整理，一次说清。”及原副标题，新配图直观表达把整理后的资料给医生看；下一张仍是独立的长期记忆档案。医生手势只作交流理解的视觉表达，不新增诊断、速度保证或AI能力。图不包含实际孩子资料。

仅更换 `FrontDeskBanner.tsx` 的就诊素材引用、真实尺寸与替代说明；旧素材保留。文字用HTML，图片完整contain，常规屏上下、短屏双列复用现有布局。三张顺序、10秒停留、马赛克、输入/聚焦/后台暂停、减少动态效果、独立加载失败跳过与迟到加入、首气泡整体卸载全部沿用。首次消息后不留视觉空间，取消/未发送输入不当消息；记录归属、持久化、报告、导出、其他页面和两张素材冻结。本次无数据迁移、正式数据写入或真实付费AI验收；不发布原生包，只现有Production。

## 图片来源

内置ImageGen根据用户确认的方案 `generated_images/exec-56b00bfd-c119-4c5c-b42a-41643d524088.png` 编辑出透明独立插图 `generated_images/exec-01c51a3a-1523-47a2-a672-76e1da6d85ec.png`。保留妈妈、医生、手机、报告气泡及浅桌面，移除背景与画面营销字。使用sharp做格式转换与720宽等比缩放，产物 `src/assets/nurse-triage/visit-summary-banner-doctor-20261030.webp`，720×480，保留alpha。夹子无AI字样；无后方档案堆。

生成提示词见下；这是画面设计，不是功能或供应商验收。

## 验证映射

- 对照已确认图核对妈妈背面、医生正面、OK手势、手机报告气泡与无档案堆。
- 完整构建和现有横幅浏览器场景验证正常/窄/矮屏同尺寸、内容不碰撞、完整图片；复用加载失败、迟到、轮播暂停和第一气泡卸载检查，不为素材替换新增重复实现测试。
- 全中文字体注入仅用于本地预览，不改产品字体；模拟账户与供应商不冒称正式登录、实体iPhone或真实AI验收。
- 合入main后必须看到含本次提交的Production终态SUCCESS，并只读核验 `/api/health`、`/nurse-station`、实际JS/CSS与新图片字节；发布结果归档在PR回执。

首次CI在 `welcome.spec.ts:80` 等待首页“添加照片、视频或文件”按钮超时；主分支现行 `archive-manual-polish-20261030.md` 已明确移除该入口。本次同步该既有用例：保留帮助往返、未发送内容和刷新恢复断言，将附件取消操作改为断言上传按钮与隐藏文件输入均不存在，不恢复已移除功能、不更改业务。横幅14项在该失败之前均通过；重新验证结果另记PR回执。

## 最终生成提示词

```text
Edit the provided approved Hoooho banner into a production transparent ARTWORK ONLY. Extract/recreate precisely its LOWER consultation scene in the same polished full-bodied mint-and-ivory 3D style: black-haired mother in mint knit top on LEFT seen FROM BEHIND, holding up the smartphone; friendly black-haired glasses-wearing male doctor on RIGHT seen from the FRONT, in white coat with stethoscope, smiling and making the same anatomically correct OK hand gesture; a SMALL cream rounded report-preview bubble immediately above the phone, tail pointing to the phone, containing the organized medical summary with profile, timeline and sections. Preserve these character identities, poses, colors, mutual gaze and relative placement faithfully. Mother's face must remain unseen. Keep phone visible with matching report UI. Keep the plain unmarked clip on the miniature report, no AI letters or other readable words anywhere. Remove ALL upper marketing typography, rounded green banner, green clinic wall, plant, windows, distant furniture and chairs. Actual transparent background with clean alpha, NOT green/white background. Retain only the mother, doctor, phone, report bubble and a very shallow minimal warm-ivory consultation desktop strip that visually joins the two characters at the bottom. Compact broad silhouette approximately 1.5:1, camera pulled back just enough that all head, hair, shoulders, elbows, OK fingers and the report bubble edges are complete with a small transparent outer margin; natural waist-up characters, bottom bounded by the little desktop vignette, no harsh lateral cropping. Doctor must not look at camera; he responds to mother/phone. No giant clipboard, no archive stack, no extra characters, no new badges, no logos, no text, no new scene elements. This will be used as a contained lower illustration in a small mobile banner, so retain a clear readable interaction and large enough phone/report bubble.
```
