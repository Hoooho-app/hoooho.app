# Complete clay avatars v1

Family avatars use pre-rendered 512×512 PNG files from
`public/avatars/clay/v1`. The client never assembles facial features, hair, or
outfits and does not call an online image-generation service.

## Roles and assets

The base set contains boy, girl, adult male, adult female, elder male, and
elder female roles. The early-childhood extension adds baby and toddler roles.
Every role has six internal appearance presets. These identifiers are never
shown in the interface and are independent of name, language, locale, and
country.

`src/utils/clayAvatar.ts` is the single manifest and behavior boundary. It:

- maps birth date and gender to a role;
- derives a stable default from normalized family details;
- cycles the six complete images without repetition within a round;
- preserves the appearance preset when birth date or gender changes;
- serializes `clay:v1:<role>:<appearance>`;
- maps the previous layered `clay:v1:<role>:<face>:<hair>:<outfit>` format to
  a stable complete avatar.

Photo data URLs and legacy `virtual:*` values remain readable. A cartoon or
photo avatar is persisted only with the surrounding family-member save action.
