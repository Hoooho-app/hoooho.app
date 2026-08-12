# Hoho Design System V1

## 1. Formal status

Status: **production-approved, globally migrated and frozen**.

Hoho Design System V1 is the only default visual system for current and future product pages. The production `/health-events` page is the primary real-product reference. V1 standardizes visual language without changing product information architecture, business rules, data contracts or navigation flows.

Principles: Calm, Trustworthy, Human, Medical and Private.

Avoid dashboard density, large tinted blocks, excessive borders or shadows, decorative badges, card nesting and page-specific component systems.

## 2. Token contract

Source: `src/styles/tokens.css`.

- Color: `--hoho-color-primary*`, secondary, background, surface, border, three text levels and semantic success/warning/error.
- Typography: page title, section title, card title, body, caption and label.
- Spacing: `4, 8, 12, 16, 24, 32, 40px`.
- Radius: small `8px`, medium `12px`, large `20px`, pill.
- Shadow: none, soft and floating.

Legacy `--color-*`, `--radius-*` and `--shadow-*` variables are compatibility aliases to the Hoho tokens. They are not a second visual system and must not receive independent values.

Illustration artwork, including virtual-avatar skin, hair, clothing and background palettes, is an asset-level exception rather than UI color definition.

## 3. Components

Import from `src/components/design-system`.

- `Typography`: the six frozen type levels.
- `HealthCard`: important health-content surface with restrained border and elevation.
- `HealthTag`: lightweight factual or status label.
- `HealthTimeline`: explicit `list` and `detail` visual levels.
- `HohoButton`: primary, secondary, danger and text actions.
- `HohoInput`: labeled field with hint, error and accessible state.
- `HohoSection`: flat page section with optional title, description and action.
- `HohoSurfaceRow`: reusable settings, menu and list row.
- `HohoToggle`: accessible binary control.
- `ModalSurface`: common dialog/sheet surface.
- `EmptyState`: natural empty-content guidance.

The components in `components/common` remain compatibility adapters and delegate their visual behavior to V1. New code should prefer direct Design System imports.

## 4. Surface hierarchy

- Page: natural background and generous whitespace.
- Section: flat by default; no card required.
- Important surface: use `HealthCard` when separation has product meaning.
- Fact/event: choose the lightest container that preserves scanability.
- Tag: semantic only, never decorative.
- Floating shadow: overlays and genuinely floating controls only.

## 5. Health timeline hierarchy

- Health event list (`level="list"`): year, date and event summary. It does not emphasize minute-level process time.
- Health event detail (`level="detail"` or the established detail timeline): exact time or period, symptoms, temperature, medication, examinations, status changes and attachments.

The list and detail share tokens and component quality, but must remain visually distinct. Grouping, ordering and time semantics remain in service/adapter/domain boundaries.

## 6. Extension rules

A missing visual capability must be added to the Design System instead of creating a parallel page-level style. A new component must:

1. serve at least two product contexts;
2. contain no health business logic;
3. own only visual and basic interaction behavior;
4. use `--hoho-*` tokens;
5. be documented here.

Do not introduce another UI framework, change the token scales, or replace V1 without explicit user authorization.

## 7. Migration coverage

The V1 baseline covers all user routes registered in `src/app/router.tsx`:

- login and first-profile setup;
- family list, add and edit-basic-information flows;
- health event list, filters, detail, first record, continuation record, timeline, charts and attachments;
- health profile;
- side drawer and role navigation;
- guide, settings, messages, help, feedback and about pages;
- loading, error and empty states mounted by those routes.

Development fixtures, test pages and internal tools are outside the migration scope.

## 8. Frozen boundaries

V1 does not authorize changes to data models, APIs, permissions, AI/parser behavior, HealthFact, time resolution, event matching, event creation rules or established interaction flows. Local visual changes must remain inside the explicitly requested surface.
