# Family cartoon avatars

Family avatars are complete, pre-rendered WebP images. The client never
assembles facial features, hair, or outfits and does not call an online
image-generation service.

## Children

The final child set is stored in `public/avatars/children/v1` and contains
exactly 48 content-hashed 256×256 WebP files:

- ages 0 through 7;
- girls and boys;
- three internal variants for every age and gender.

`src/utils/childAvatar.ts` is the single behavior and resolution boundary.
Birth date determines age, gender determines the matching set, and the change
button cycles the three variants in a fixed order. The internal variant names
are never displayed and are not inferred from profile metadata.

Only the current image is requested on entry. After it decodes successfully,
the other two images in the same age and gender group are preloaded. Historical
child cartoon IDs are recognized only long enough to map them to this final
set; deleted child assets are never requested.

## Adults and elders

The existing adult and elder set remains in `public/avatars/clay/v1`.
`src/utils/clayAvatar.ts` continues to resolve those roles so this child-only
replacement does not regress unrelated family profiles.

Photo data URLs remain readable and are never replaced during compatibility
mapping. A cartoon or photo avatar is persisted only with the surrounding
family-member save action.
