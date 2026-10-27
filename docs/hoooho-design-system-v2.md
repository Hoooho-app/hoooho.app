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
