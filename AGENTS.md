# Hoho Design System Freeze V1

Hoho Design System V1 is the project's formal and frozen visual baseline.
The reference implementation is the production-approved `/health-events` page,
the `--hoho-*` tokens in `src/styles/tokens.css`, and the components in
`src/components/design-system/`.

- New pages and components must use `--hoho-*` tokens and existing Design System components first.
- Do not define a parallel primary color, typography scale, spacing scale, radius, shadow, button, card, tag, input, modal or timeline style inside a page.
- If a reusable visual capability is missing, extend `components/design-system/` and document it. An extension must be reusable in at least two product contexts and contain no health business logic.
- Do not introduce another UI framework, replace the Design System, or globally redesign the product without explicit user authorization.
- Do not change a frozen page's information architecture or interaction flow while performing visual work.
- A local page request changes only the explicitly named surface; all other product surfaces remain frozen.
- Health event hierarchy is frozen: the list page emphasizes year/date/event summary, while the detail page emphasizes exact time and health fact changes. Shared visual language must not erase this distinction.
- Avoid dashboard density, card nesting, decorative badges, large tinted blocks and nonessential elevation. Sections are flat by default; cards are reserved for important surfaces.
- Hoho is a mobile-first web product. Do not add native-app navigation patterns or unrelated app chrome.
- Backend, API, data, AI/parser, HealthFact and time-resolution changes must stay behind their existing boundaries and must not be made as part of visual migration.

Illustration artwork such as virtual-avatar skin, hair and clothing palettes is an asset-level exception; those colors are not UI tokens.

See `docs/hoho-design-system-v1.md` for the component and token contract and `docs/ui-freeze-v1.md` for the review checklist.

## Health time semantics

- Health event and health record occurrence times represent facts that already happened or are happening now.
- Every write of `startTime` or `occurredAt` must enforce `value <= current time` in both the UI and the server API.
- The server is authoritative: future values must fail validation before persistence or AI Parser/Organization processing.
- Compare instants after ISO 8601 parsing so client and server timezone differences do not change the rule.
