"""Extract UI clipping geometry from existing images; never modify the artwork.

Development-only: Pillow and numpy. The checked-in result is used at runtime and
its source hashes are checked in the normal JS asset check (no Python in CI).
"""
from pathlib import Path
from hashlib import sha256
import json
import math
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent


def simplify(points, epsilon=1.1):
    if len(points) < 3:
        return points
    a, b = points[0], points[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    distances = [abs(dy * (p[0] - a[0]) - dx * (p[1] - a[1])) / length
                 if length else math.dist(a, p) for p in points]
    i = max(range(len(points)), key=distances.__getitem__)
    if distances[i] <= epsilon:
        return [a, b]
    return simplify(points[:i + 1], epsilon)[:-1] + simplify(points[i:], epsilon)


def silhouette(file):
    pixels = np.asarray(Image.open(file).convert('RGBA'))
    h, w = pixels.shape[:2]
    if pixels[:, :, 3].min() < 128:
        foreground = pixels[:, :, 3] >= 128
    else:
        # White-background legacy face/hand/foot atlases. Flood only the exterior
        # so eye whites, nails and highlights remain part of the silhouette.
        rgb = pixels[:, :, :3].astype(int)
        foreground = ~((rgb.min(axis=2) > 235) & (rgb.max(axis=2) - rgb.min(axis=2) < 22))
    flood = Image.fromarray(np.where(foreground, 0, 255).astype('uint8')).copy()
    border = [(x, y) for y in [0, h - 1] for x in range(w)]
    border += [(x, y) for x in [0, w - 1] for y in range(h)]
    for p in border:
        if flood.getpixel(p) == 255:
            ImageDraw.floodfill(flood, p, 128)
    foreground = np.asarray(flood) != 128
    padded = np.pad(foreground, 1)
    edges = {}

    def add(a, b):
        edges.setdefault(a, []).append(b)

    # Directed pixel edges, retaining the exact outer edge and inter-finger gaps.
    for dy, dx, offset_a, offset_b in [
        (-1, 0, (0, 0), (1, 0)), (0, 1, (1, 0), (1, 1)),
        (1, 0, (1, 1), (0, 1)), (0, -1, (0, 1), (0, 0))
    ]:
        neighbor = padded[1 + dy:1 + dy + h, 1 + dx:1 + dx + w]
        ys, xs = np.where(foreground & ~neighbor)
        for x, y in zip(xs.tolist(), ys.tolist()):
            add((x + offset_a[0], y + offset_a[1]), (x + offset_b[0], y + offset_b[1]))
    paths = []
    while edges:
        start = next(iter(edges))
        points, current = [start], start
        while True:
            following = edges[current].pop()
            if not edges[current]:
                del edges[current]
            points.append(following)
            current = following
            if current == start:
                break
        area = abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:]))) / 2
        if area < 180:
            continue
        split = max(range(len(points)), key=lambda i: math.dist(points[0], points[i]))
        points = simplify(points[:split + 1])[:-1] + simplify(points[split:])[:-1]
        paths.append([[round(x / w, 5), round(y / h, 5)] for x, y in points])
    return {'width': w, 'height': h, 'sha256': sha256(file.read_bytes()).hexdigest(), 'contours': paths}


manifest = json.loads((ROOT / 'public/body-locator/v3/manifest.json').read_text())
files = [x['asset'] for x in manifest['assets'].values()]
files += [f'/body-locator/v1/{name}.png' for name in ['girl-face', 'boy-face', 'hand-left', 'hand-right', 'foot-left', 'foot-right']]
files += [f'/body-locator/v2/neutral-{view}.png' for view in ['front', 'back']]
result = {'version': 1, 'coordinateSystem': 'normalized-source-image', 'assets': {}}
for path in files:
    result['assets'][path] = silhouette(ROOT / 'public' / path.lstrip('/'))
    print(path, sum(map(len, result['assets'][path]['contours'])), 'vertices')
(ROOT / 'src/features/body-location/child-data/selection-contours.json').write_text(json.dumps(result, separators=(',', ':')) + '\n')
