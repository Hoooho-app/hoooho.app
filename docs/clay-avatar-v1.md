# Hoooho Clay Avatar V1

Family avatars use the versioned `clay:v1` configuration stored in the existing
`FamilyMember.avatar` field. The serialized order is role, face, hair, and
outfit. Legacy `virtual:*` identifiers and photo data URLs remain readable.

The project-bound source sheets live under `public/avatars/clay/v1/source/`:

- `faces-v1.png`: 3 skin variants by 6 age/gender roles.
- `hair-v1.png`: 12 hair overlays in a 4 by 3 grid.
- `outfits-v1.png`: 3 brand colors by 6 age/gender roles.

The source sheets were created with the built-in image generation tool from the
approved Hoooho hand-molded 3D clay references. They are static application
assets; changing an avatar never calls an image-generation service or uploads
profile data.

`ClayAvatar` removes the uniform light source-sheet background locally, caches
each selected cell, and draws face, outfit, then hair on one fixed 256 by 256
canvas. Cell coordinates, grids, options, and source paths are centralized in
`src/utils/clayAvatar.ts`.
