# Hoooho Design System V2

Hoooho V2 is quiet, trustworthy and information-first. Its product-owner-approved logo (2026-10-17) is the ivory parent-and-child h-shaped mark with an apricot dot on a green background. Use the shared brand assets in app identity, installation icons and selected brand moments; the former three-point trace is retired. It uses hierarchy, spacing, borders and restrained surfaces before effects.

## Foundations

- Brand: Hoooho Green `27 122 110` (`#1B7A6E`), Deep Teal `18 92 85`, Soft Mint `233 246 242`, Warm Clinical `245 248 246`, Ink `24 49 47` and Muted `82 105 102`.
- Surfaces: page, primary, subtle and elevated roles; ordinary content uses borders instead of ubiquitous shadows.
- Smart-record conversations and review cards opt into `--hoho-color-surface-white` over the existing paper page background. Other surfaces retain their existing roles.
- Visit-summary entry surfaces share `--hoho-color-visit-entry-surface` (`#F2F6F9`) between the front-page entry and the journal subject action; text remains dark for contrast.
- Text: primary, secondary and readable tertiary roles. Error, warning, success and information colors are semantic and never the only carrier of meaning.
- Font: platform-first Chinese stack covering SF Pro Display, PingFang SC, Microsoft YaHei and Noto Sans CJK, with stable system fallbacks and tabular numeric data. Product headings use 600, labels use 500 and body copy uses 400; avoid synthetic extra-bold display text.
- Type: display, page, section, card, body, label, caption and data roles.
- Spacing: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40.
- Radius: 6px small, 12px controls, 16px cards, 26px overlays. Pills are reserved for true status capsules, segmented controls and circular controls.
- Elevation: card, floating and overlay. Ordinary grouped lists remain flat.
- Motion: 140ms feedback, 200ms ordinary transitions, 280ms complex transitions using standard and emphasized easing. `prefers-reduced-motion` removes decorative movement.
- Layout: responsive gutters, 680px compact content and 1120px application maximum.

## Component contracts

- `HohoButton`: primary, secondary, tertiary, ghost, danger and text levels; small/medium/large/icon sizes; disabled and loading states.
- `HohoInput`: label, hint, invalid state, associated message and screen-reader alert. `hideLabel` retains an accessible label without a visible heading in compact conversation composers (record lookup and product help).
- `DialogueComposer`: a single 44px row shared by nurse, record, help and feedback conversations, ordered keyboard icon / “按住说话” / camera icon, with accessible labels. The camera icon retains explicit camera and album choices by default; `directPhoto` lets the front-desk smart-record page open the non-capture image picker directly, leaving the single native choice to the OS. An optional `inputOnly` variant omits keyboard mode and places the icon-only camera before the hold bar for forms that already have a text field; `releaseLabel` describes the local release action. All hold-to-talk entrances use `HoldToTalkButton`: the standard primary action color, immediate pressed feedback and optional short vibration without a sound, a subtle halo centered on the contact point, and a recording label above the finger. Microphone startup is distinct from recording; release ends the segment and sliding up cancels when supported. Pointer cancellation, capture loss, page hiding and unmount discard the active gesture. Vibration is best effort on supported hardware and browsers. Text mode replaces the middle control with an input and send action. Keep status, retry, organization and confirmation actions inside the assistant's conversation bubble rather than additional footer rows.
  Omitting `onPhoto` hides the attachment control and collapses its grid column, for text/voice-only guided questions such as first-child initialization and other structured dialogue steps. Existing callers with media handlers retain all prior attachment behavior.
- Nurse conversations preserve one user bubble per release/send. Reply speech is stopped before recording; native speech is primed in a user gesture and a replay/stop icon stays inside the reply bubble. Local originals are byte snapshots, and expired-token requests use the shared session recovery path.
- The smart-record workspace is a silent exception: no reply speech or replay icon, with microphone input retained. It automatically organizes each completed input and exposes “核对 N 条记录” and “直接记录” in the reply; zero-item replies have neither. Voice originals remain stored without inline audio players. Conversation text uses the body-small token; recognition steps stay in a compact horizontal row without repeating a status heading. Its full-page “核对记录” stage uses separate HealthCards, adjacent green text “编辑” actions and deletion inside the name editor, with one list-level “新增记录” entry and one save action.
- `HealthCard`: quiet bordered surface; interaction adds a restrained state, not a stronger default shadow.
- `HoldToTalkButton` optionally supports `expandedFeedback` and `feedbackHint` for a larger above-finger status panel and recording timer. `DialogueComposer` forwards these opt-ins; compact feedback remains the default. Smart record opts in and says “松开后显示文字”, matching its existing release-time recognition. The timer begins only after microphone startup succeeds.
- `HealthTag`: compact semantic label; visible wording accompanies color.
- Food-label facts use `--hoho-color-food-common-surface` (pale orange) and personal uncertainty uses `--hoho-color-food-possible-surface` (pale yellow), with the existing warning foreground and `HealthTag`. These opt-in semantic surfaces apply to ingredient rows and packaging notices only; existing warning/error components and all other pages are unchanged.
- `HohoSurfaceRow`: consistent minimum target, title, description, value and action placement.
- `StatusNotice`: information, success, warning and error messaging with icon, text and optional action.
- `EmptyState`: compact message and one clear recovery action.
- `ListSkeleton`: reusable non-blocking loading placeholder with reduced-motion support.
- `BottomSheetSurface` and the main drawer: scroll containment, Escape, focus trap, focus restoration and safe-area padding. Focused subflows may pair a leading back action with the optional text dismissal action; ordinary sheets keep the standard close icon.
- Grouped navigation and settings lists: one flat continuous surface with row dividers; do not wrap every row in an independent card.
- Record subject identity: one shared compact member surface; detail pages must not nest it inside a second card.
- Journal record actions are text-only with five 44px direct-entry targets (symptom, feeding, daily, medication and visit documents) and a centered text-only smart action. Record form saves appear in the top-right header; nested diet and sleep editors keep their own validation and submit handlers. Timeline markers align with the year separator; time-based recording reminder cards and their prefill/trigger lifecycle are retired. Explicit manual recording, routine tracks and medication reminders remain independent.

## Interaction hierarchy

- One primary action per view. Primary buttons may use the restrained Hoooho Green gradient; ordinary surfaces do not use large gradients.
- Top bars use explicit text for consequential actions such as “保存”; icon-only controls require familiar semantics and an accessible name.
- Bottom sheets use one clear close affordance, a compact handle and a single segmented navigation pattern when switching modes.
- Picker selection rows are flat and direct. Avoid dashed upload-style boxes for ordinary selection actions.
- Empty, loading, error, disabled and incomplete states include readable text and never depend on color alone.

## Accessibility

`SessionRecoveryScreen`（2026-10-28）在启动与首次档案加载中复用居中品牌标识、平台字体、轻量无百分比等待条及底部“记录 · 整理 · 交接”。等待提示对应账号／孩子／档案的实际阶段，慢连接给出轻提示，失败保留原位重新连接；不把旧账号资料当启动占位。减少动态效果时关闭等待条动画。此视觉仅用于恢复页，已打开表单继续使用现有非阻断提示。

- All interactive controls target at least 44px unless a compact secondary action remains embedded in a larger target.
- Global `:focus-visible` remains visible independently of color.
- Current navigation uses `aria-current` plus a background and position marker.
- Tabs use tab roles and `aria-selected`.
- Form errors use `aria-invalid`, `aria-describedby`, live regions and alert roles.
- Motion is reduced to near-instant feedback when the user requests reduced motion.

### Category colors for arrangement views

`--hoho-color-category-*` identifies the nine family workspace categories. These opt-in tokens are shared by month cells, month-only arrangement entries and grouped arrangement trees. Keep the category name and text summary alongside color, and preserve the existing monochrome family workspace controls and all unrelated product themes.

## Brand naming

### 前台条件标签（2026-10-27）

前台采用 opt-in `--hoho-color-record-*` 色彩角色：底部症状／就诊资料／用药／日常分别为浅绿／浅蓝／浅紫／相近浅粉紫；顶部已保存记录与已生成清单使用对应较深的 `symptom-pinned`／`material-pinned`，保留文字识别。初始不渲染顶部空栏，记录可访问后出现“症状记录单”，一键整理成功且内容可查看后出现“就诊清单”；首次整理操作留在对话内。仅前台使用这些角色，其他页面配色与全局主题保持原样。

Visible product copy and generated share images use `Hoooho`. Persistence keys and protocol identifiers keep their existing spelling because changing them would be a data or API migration rather than a visual change.

### Nested original preview

Original photo previews opened from an existing record, reminder or upload workspace use `BottomSheetSurface` with `layerClassName="hoho-bottom-sheet-layer--nested"`. Render this layer in a body portal so it stays above the parent form without inheriting thumbnail sizing or clipping. This changes stacking only and retains the standard sheet, controls and tokens.


### 树芽功能入口（V6）

`SproutEntry` 用于现有食品扫描、忌口卡、用药与档案页面中的树芽功能入口。其背景／边框／前景使用 `--hoho-color-sprout-surface/border/text` 固定淡绿，与会员主题主色分开；晨雾蓝主题也保留此识别色。仅该授权入口增加淡绿，不改变原表单或健康状态语义。`CareHandsIcon` 为双手形成心形空隙的轻入口，首页只显示图形并保留无障碍名称。

### Duration and count progress

`HohoProgress` displays a value/max with an accessible label. Use its continuous mode for care journey growth/achievement counts and its segmented mode for individual observation durations up to 14 steps (longer durations remain continuous). `tone="sprout"` preserves the existing fixed sprout green. The component has no completion or health interpretation; each feature supplies that meaning in adjacent text.


### 2026-10-24 纸面层次与首页对话精修

产品主人授权全健康产品统一纸底纹理与既有浮卡阴影。全页及安全区用 `--hoho-page-grain`，卡片保留更轻的 `--hoho-paper-grain`；现有浮卡统一 `--hoho-shadow-card`，扁平列表和输入框不新增浮卡效果。首页接待横幅使用112px视频（窄屏96px），头像取消，双方气泡通栏。侧栏去边框、分隔与关闭图标，宽度 `min(78vw,300px)`，空白和Escape关闭，键盘焦点局部标识。单相机入口复用共享底部面板提供照片、拍照、视频和文件选项。完整本轮规范见 [纸面与对话精修](design/paper-conversation-refinement-20261024.md)。

### 2026-10-24 纯粹记录体验补充

纸底纹理采用版本化的`paper-fiber-rough-20261024.svg`，以低透明纤维叠加细粒呈现轻粗纸质感，卡片继续使用较轻纹理。饮食／瓶喂的名称输入与真实时间编辑共用一行，输入沿用`HohoInput`与44px目标，不再另占标题行。辅助工具、呵护之旅和会员展示按共享可见性开关暂藏，原实现与数据保留。范围和时间建议名规则见[纯粹记录体验](design/pure-record-experience-20261024.md)。


### 2026-10-25 前台定向调整

首页标题为「前台」，欢迎横幅用既有黑发护士的静态半身招呼图；原护士站视频仅在实际解析时显示。双方气泡保持通栏，头像内嵌，助手沿用金发护士。`DialogueComposer` / `HoldToTalkButton` 可选 `liveTranscript` 与 `liveStatus`，将实际转写放在录音反馈层内，避免被遮罩盖住；首次资料对话和前台共用，其他调用保持原行为。症状跟进仅在用户明确启用且存在进行中事项时显示。旧规范中首页无头像、欢迎区常播视频的约定由本段替代。

### 2026-10-28 前台确认与接待区

产品主人确认：首页改用既有护士站视频居中展示，当前成员档案员文案随姓名及性别更新。`ReceptionSurface` 增加可选 `layout="stacked"`，可供接待与首次使用介绍复用；默认横排及其他调用不变。媒体离屏、页面后台或减少动态效果时暂停。

`DialogueComposer.holdLabel` / `HoldToTalkButton.idleLabel` 是场景可选文案，前台为“按住记录症状”，其他场景仍为“按住说话”。用户消息处理时在自己的气泡内保留一个 loading，无伪造的护士“收到”气泡。记录单在追问结束并确认生成后展示；保存状态以底部小图标和真实查看动作体现，不再将“已记录”拼在标题后，也不提供“查看原话”展开入口；持久原件不删除。

前台症状／资料／用药／日常色彩分别调整为浅绿、浅蓝、浅紫、相近浅粉紫。就诊整理动作独立采用前台专用暖杏色 `record-organize-*`，不复用警告语义；已生成清单的顶部入口仍采用较深的资料蓝色。颜色仅改变前台 opt-in 角色，不改变全局主题或其他页面。


### 2026-10-29 关键信息与记录单阅读

首页统一使用现有纸页色（包括底导安全区），视频缩小且取消额外放大，孩子信息独立圆角浅绿底。顶部去标题，欢迎语使用记录员护护；前台助手气泡取消头像，用户处理指示紧跟文字。既有其他对话调用不变。

前台记录与对应日历详情的阅读投影只展开情况概述、关键词，其他内容使用原生 details/summary 默认折叠且保持44px目标；正文取消输入框式边框、填充与底色。折叠不删除保存/导出正文。确认整理取得正式保存回执后展示只读结果，编辑为显式操作；失败保留原内容，不能以灰色保存按钮替代实际进行中反馈。

### 2026-10-29 全局功能图标 V3

产品主人确认全局采用 Google Material Symbols Rounded，固定 wght 300、opsz 24、GRAD 0。同一原图的 FILL 0 用于未选中，FILL 1 用于实际选中／收藏；动作、加载、错误和保存回执各自保留原业务语义。统一使用 `components/icons/MaterialIcon` 与固定版本的原始路径，普通尺寸为16／20／24／32，不按页面改变线宽，也不加载远程字体。

旧 Lucide、自绘功能 SVG、字符按钮、CSS 下拉箭头及图片分类入口均归入本套。已确认的文字分类入口继续使用文字。原 `CareHandsIcon` 小型功能入口改用同库 `volunteer_activism`，护士形象、头像、精确人体图、数据图表及护护品牌保留内容身份。

睡眠统一 `bedtime`，醒来 `sunny`，就诊 `stethoscope`，检查 `lab_research`，关注 `favorite`。身体部位的入口统一人形 `person` 与准确部位标签，精确位置仍由原人体图表达。Apple 登录与绑定共用真实品牌轮廓，微信和 QQ 为单独品牌资产，不制造品牌的空心／实心变体。

食物小图与导出采用同库准确母版：苹果 `nutrition`、牛奶 `local_drink`、鸡蛋 `egg`。缺少准确图形的13种食物只展示完整名称，不借其他食物代替。此段替代早期图片食物图标及自绘功能图标的约定，其他页面结构、数据和业务保持既有边界。任务与验证见 [全局图标替换契约](design/global-material-icons-v3-20261029.md)。

### 侧栏对话状态色（2026-10-30）

对话标题及图标采用正文主色；真实已保存状态使用 success 绿色的“已记录”纯文字，无背景；未保存条目显示黄色“待确认”，保存后仍有未知内容时跟随“有待确认”。对话不确定性专用 `--hoho-color-conversation-pending` 明亮橘黄色，覆盖侧栏原棕色观感；其他模块 warning 语义色不变。

### 侧栏环抱身份区（2026-10-30）

产品主人手绘确认的账户环抱仅在侧栏使用 `identity-embrace`、`identity-outline`、`identity-subject` 三个 opt-in 颜色角色：浅绿账户、轻细连通轮廓、奶油杏色孩子栏。装饰SVG独立于功能图标库，不含交互、不读取业务状态，不推广到其他卡片；沿用现有字号、间距及圆角。
