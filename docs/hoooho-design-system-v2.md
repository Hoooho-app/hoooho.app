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
- Nurse conversations preserve one user bubble per release/send. Reply speech is stopped before recording; native speech is primed in a user gesture and a replay/stop icon stays inside the reply bubble. Local originals are byte snapshots, and expired-token requests use the shared session recovery path.
- The smart-record workspace is a silent exception: no reply speech or replay icon, with microphone input retained. It automatically organizes each completed input and exposes “核对 N 条记录” and “直接记录” in the reply; zero-item replies have neither. Voice originals remain stored without inline audio players. Conversation text uses the body-small token; recognition steps stay in a compact horizontal row without repeating a status heading. Its full-page “核对记录” stage uses separate HealthCards, adjacent green text “编辑” actions and deletion inside the name editor, with one list-level “新增记录” entry and one save action.
- `HealthCard`: quiet bordered surface; interaction adds a restrained state, not a stronger default shadow.
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

## Brand naming

Visible product copy and generated share images use `Hoooho`. Persistence keys and protocol identifiers keep their existing spelling because changing them would be a data or API migration rather than a visual change.

### Nested original preview

Original photo previews opened from an existing record, reminder or upload workspace use `BottomSheetSurface` with `layerClassName="hoho-bottom-sheet-layer--nested"`. Render this layer in a body portal so it stays above the parent form without inheriting thumbnail sizing or clipping. This changes stacking only and retains the standard sheet, controls and tokens.


### 树芽功能入口（V6）

`SproutEntry` 用于现有食品扫描、忌口卡、用药与档案页面中的树芽功能入口。其背景／边框／前景使用 `--hoho-color-sprout-surface/border/text` 固定淡绿，与会员主题主色分开；晨雾蓝主题也保留此识别色。仅该授权入口增加淡绿，不改变原表单或健康状态语义。`CareHandsIcon` 为双手形成心形空隙的轻入口，首页只显示图形并保留无障碍名称。

### Duration and count progress

`HohoProgress` displays a value/max with an accessible label. Use its continuous mode for care journey growth/achievement counts and its segmented mode for individual observation durations up to 14 steps (longer durations remain continuous). `tone="sprout"` preserves the existing fixed sprout green. The component has no completion or health interpretation; each feature supplies that meaning in adjacent text.
