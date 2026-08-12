# Hoho Design System V1

## 1. Purpose and status

Hoho Design System V1 establishes a calm, trustworthy and human visual foundation for future page migrations. It does not change information architecture, business logic, data contracts or existing frozen pages.

Status: **Foundation ready, page migration not started.**

Design principles:

- Calm: low-saturation color and restrained elevation.
- Trustworthy: clear hierarchy, readable contrast and predictable interaction.
- Human: generous whitespace and natural guidance instead of dashboard density.
- Medical: precise structure without looking like a hospital administration system.
- Private: quiet surfaces and limited visual noise.

## 2. Compatibility boundary

The V1 foundation is additive:

- New tokens use the `--hoho-*` namespace.
- Existing `--color-*`, `--radius-*` and `--shadow-*` tokens remain unchanged.
- New components live in `src/components/design-system/`.
- No existing page imports these components yet.

This boundary prevents an unplanned global restyle. A page adopts V1 only through an explicit migration task.

## 3. Design tokens

Source: `src/styles/tokens.css`.

### Color

| Token group | Role |
| --- | --- |
| `--hoho-color-primary*` | Deep, low-saturation teal for primary actions and emphasis |
| `--hoho-color-secondary` | Supporting blue-grey accent |
| `--hoho-color-background` | Very light warm grey-green page background |
| `--hoho-color-surface*` | White and subtle neutral content surfaces |
| `--hoho-color-border*` | Quiet separators and stronger interactive boundaries |
| `--hoho-color-text-primary` | Deep blue-grey primary content |
| `--hoho-color-text-secondary` | Supporting content |
| `--hoho-color-text-weak` | Captions and low-priority metadata |
| `--hoho-color-success/warning/error` | Semantic feedback only, not decoration |

Do not use large blocks of semantic or primary soft color. Prefer the background, surface and border tokens for layout.

### Typography

| Variant | Use |
| --- | --- |
| `Page Title` | One page-level heading |
| `Section Title` | Major content sections |
| `Card Title` | Concise card subject |
| `Body` | Default reading content |
| `Caption` | Dates, metadata and supporting notes |
| `Label` | Compact controls and factual tags |

Use the `Typography` component or the matching `.hoho-text-*` class. Do not promote supporting copy to title styles.

### Spacing

The fixed scale is `4, 8, 12, 16, 24, 32, 40px`, exposed as `--hoho-space-1/2/3/4/6/8/10`.

New V1 components should use this scale. A page migration should replace arbitrary spacing only inside that page's authorized scope.

### Radius

- Small: `8px` for compact elements.
- Medium: `12px` for controls.
- Large: `20px` for health content surfaces.
- Pill: fully rounded tags and primary actions.

### Shadow

- None: default for flat layout.
- Soft: restrained card separation.
- Floating: overlays or true floating controls only.

## 4. Components

Import from `src/components/design-system`.

### HealthCard

General health information surface with a light border, generous padding and soft shadow. `interactive` adds only restrained hover/press feedback. Business navigation stays with the consuming page.

### HealthTag

Lightweight factual label with `neutral`, `primary`, `success`, `warning` and `error` tones. Use for facts such as symptom, temperature, medication, examination or status. Do not use tags as decorative badges or repeat a status already clear from nearby content.

### HohoButton

- `primary`: the single main action in a context.
- `secondary`: supporting action with an outlined surface.
- `text`: low-emphasis inline action.

All variants preserve a 44px primary touch target, keyboard focus visibility, disabled state and button semantics.

### EmptyState

Natural guidance for genuinely empty content. It accepts a title, optional description, icon and action. It must not advertise unavailable functionality or add dashboard-style placeholders.

### HealthTimeline

The component has an explicit `level` contract:

- `list`: groups events by year/date and emphasizes the day. It must not present minute-level process detail as the main axis.
- `detail`: presents exact time and fact changes such as symptoms, temperature, medication, examinations and attachments.

The component is presentation-only. Grouping, ordering and date semantics remain in the existing service/adapter/domain boundaries.

## 5. Usage example

```tsx
import { HealthCard, HealthTag, HohoButton, Typography } from '../components/design-system'

<HealthCard>
  <Typography variant="cardTitle">发热</Typography>
  <Typography variant="body">今天体温有所升高</Typography>
  <HealthTag tone="warning">体温</HealthTag>
  <HohoButton variant="text">查看记录</HohoButton>
</HealthCard>
```

The example is documentation only and is not mounted by the application.

## 6. Migration plan (not executed)

1. Health event list page.
2. Health event detail page.
3. Health profile.
4. Profile/settings area.

Each migration must be a separate scoped task with visual regression checks. Do not replace all existing common components globally.

## 7. Frozen boundaries

V1 foundation work does not change:

- data models, schemas or API contracts;
- AI/parser behavior or HealthFact;
- event creation and update flows;
- timeline grouping or occurrence-time logic;
- existing page JSX or routing;
- existing common component behavior.
