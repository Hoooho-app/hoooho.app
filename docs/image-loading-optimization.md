# Image loading optimization

Opening the ingredient scanner previously downloaded a 1,989,563-byte PNG and painted it incrementally. The replacement is a 47,590-byte, 960px WebP. The product now reveals decoded frames while retaining each image's layout box.

116 static images were optimized from 27,548,580 bytes to 1,379,680 bytes (95% less). This includes the scanner and home illustrations, 12 calibrated body-locator assets, nurse state illustrations, installation instructions, and preset avatars. Original body calibration files remain frozen; the runtime uses content-hashed WebP derivatives with identical intrinsic dimensions. Nurse videos are unchanged.

| Asset | Enforced budget |
| --- | --- |
| Preset avatars, 256px | 16 KiB |
| New uploaded avatars | 16 KiB, with smaller fallback sizes |
| Banner and other illustrations | 80 KiB |
| Body locator atlases | 200 KiB, original calibrated dimensions |
| Clinical photo thumbnails | 80 KiB, at most 640px |
| Browser-compressed clinical / label uploads | 1 MiB, at most 2560px |

`CompleteImage` preserves existing image styling and handlers, conceals unfinished frames, and supports native lazy loading. Avatar changes keep their existing decode-before-swap behavior; unused sibling avatars are no longer downloaded eagerly. Content hashes prevent old cached resources from masking the update.

Clinical image grids use authenticated thumbnail reads. Full-size viewing and exports continue to request original content. Server thumbnail reuse happens after account/event/member ownership checks; browser blob reuse is confined to the same token and resource URL, expires after 30 seconds, and is bounded to 8 MiB. Private API image responses remain `no-store`.

The ingredient scanner uses a native image decoder fallback for Safari and an explicit compression budget. Failed compression does not silently upload a large original. Small HEIC files may use the existing server decoder; larger undecodable files show an actionable error.

Validation: production build and frozen asset checks; 590 client regressions; 68 attachment/thumbnail/visit-sheet service tests; static MIME, media-range, and upload tests; 18 ingredient-scanner browser regressions; 4 slow-load/Safari/compression-failure tests; photo viewing and upload retry browser tests; body locator dictionary, failure/retry and overlay interaction checks. Source images and WebP derivatives were compared at display size. Browser tests use synthetic records and do not call live AI providers.

`npm run test:image-assets` verifies mobile budgets, content hashes and calibrated body dimensions on every build. `scripts/optimize-product-images.mjs` regenerates derivatives when artwork changes. Network conditions can still delay downloads; the byte budgets and complete-frame reveal avoid the previously observed large-file and partial-paint behavior.
