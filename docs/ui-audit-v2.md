# Hoooho UI audit V2

## Scope and route inventory

The audit was generated from `src/app/router.tsx` and the rendered component tree rather than from a remembered page list.

| Area | Routes | Shared surface |
| --- | --- | --- |
| Authentication | `/login` | auth panel, fields, validation, status feedback |
| Onboarding | `/onboarding/profile`, legacy redirect `/onboarding/success` | page header, member form, avatar preview |
| Health events | `/health-events`, `/health-events/new`, `/health-events/:eventId` | member identity, event timeline, filters, record composer, charts, recorder, action sheet |
| Health profile | `/health-profile`, `/health-profile/:sectionId` | search, directory rows, detail forms, action bar, tags |
| Family | `/family`, `/family/new`, `/family/:memberId/edit` | member rows, forms, avatar |
| Settings and support | `/settings`, `/settings/account`, `/settings/notification`, `/settings/privacy`, `/messages`, `/guide`, `/help`, `/feedback`, `/feedback/submitted`, `/about` | grouped rows, toggles, search, segmented controls, forms, disclosure rows |
| Internal operations | `/ops` | dense summary, table, filters, edit drawer |
| Fallback | unmatched routes | dedicated 404 surface |

## Findings addressed

- The previous desktop shell was capped at 402px, so desktop rendered as a phone mock-up with unused space.
- V1 contained useful tokens but lacked elevated surfaces, information and disabled colors, a complete type scale, spacing 20, motion tokens, and content-width tokens.
- Buttons did not expose a loading contract and had an incomplete hierarchy.
- Cards, tags and buttons relied too heavily on pill radii and soft shadows.
- Bottom sheets and the main drawer did not trap focus or restore it to the trigger.
- Navigation selection relied mostly on color.
- Loading and error states did not share a reusable skeleton or status-notice pattern.
- Help disclosure motion, reduced-motion behavior, and message tabs were inconsistent.
- Visible brand strings used mixed `Hoho` and `HOOOHO` spellings.
- Unknown routes redirected to login instead of explaining that the page was missing.

## Intentionally unchanged

- Route ownership, authentication guard behavior, event/member/profile data contracts, API paths, persistence keys, health chronology, save/delete semantics, and AI organization logic.
- Existing Lucide icon dependency remains the single general-purpose icon source. Domain SVG body maps and generated avatars remain domain assets rather than a competing icon library.
- The operations page remains denser than consumer pages while inheriting global typography, color, radius, elevation and motion tokens.

## State coverage

- Loading: shared `ListSkeleton`, existing page-specific progress states.
- Empty: shared `EmptyState` and page-specific action copy.
- Error: shared `StatusNotice`, form field alerts, recorder permission guidance.
- Success: live regions and restrained status notices/toasts.
- Disabled/loading controls: tokenized disabled state and `HohoButton.loading`.
- Overlays: Escape close, scroll lock, focus entry/trap/restore, safe-area footer.

## Responsive targets

- 320px minimum mobile width without horizontal scrolling.
- 375/390/430px mobile layouts with 44px controls and safe-area padding.
- 768px tablet transition.
- 1280/1440px desktop with compact content columns inside an 1120px application shell.
