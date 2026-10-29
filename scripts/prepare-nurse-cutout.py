"""Build the front-desk cutout from the unchanged 360px source video.

Offline asset tool only: Python + Pillow, numpy, scipy and ffmpeg. No runtime
dependency or external model. MP4 stores RGB above a synchronized grayscale
matte so Safari and Chromium can use the same small, ordinary H.264 stream.
"""
from pathlib import Path
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'src/assets/nurse-triage'


def curve(a, b, c):
    return [tuple((1-t)**2*np.array(a) + 2*(1-t)*t*np.array(b) + t*t*np.array(c))
            for t in np.linspace(0, 1, 30)]


# The stationary white counter meets the white studio backdrop. Its authored
# outline keeps the white countertop/uniforms instead of color-keying them out.
outline = Image.new('L', (360, 360))
points = (curve((48,198), (150,214), (323,201))
          + curve((323,201), (322,240), (315,271))
          + curve((315,271), (290,281), (230,281))
          + curve((230,281), (120,282), (55,263))
          + curve((55,263), (49,245), (48,198)))
ImageDraw.Draw(outline).polygon(points, fill=255)
desk = np.array(outline) > 0

with tempfile.TemporaryDirectory(prefix='hoooho-cutout-') as directory:
    frames = Path(directory)
    subprocess.run(['ffmpeg', '-v', 'error', '-i', str(ASSETS/'nurse-station-idle-1.mp4'),
                    '-vf', 'fps=24', str(frames/'frame-%04d.png')], check=True)
    encoder = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo',
        '-pixel_format', 'rgb24', '-video_size', '360x720', '-framerate', '24',
        '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
        str(ASSETS/'nurse-station-cutout-packed-20261029.mp4')], stdin=subprocess.PIPE)
    for index, file in enumerate(sorted(frames.glob('frame-*.png'))):
        rgb = np.array(Image.open(file).convert('RGB'))
        white = rgb.min(axis=2) >= 248
        border = np.zeros(white.shape, dtype=bool)
        border[0] = white[0]; border[-1] = white[-1]
        border[:,0] = white[:,0]; border[:,-1] = white[:,-1]
        foreground = ~ndimage.binary_propagation(border, mask=white)
        foreground = ndimage.binary_fill_holes(ndimage.binary_closing(foreground, iterations=2))
        foreground |= desk
        foreground[232:] = desk[232:]
        alpha = np.clip((ndimage.gaussian_filter(foreground.astype(float), .55)-.06)/.88, 0, 1)
        matte = (alpha*255).round().astype(np.uint8)
        if index == 0:
            Image.fromarray(np.dstack([rgb, matte])).save(
                ASSETS/'nurse-station-cutout-poster-20261029.webp', lossless=True)
        encoder.stdin.write(np.concatenate([rgb, np.repeat(matte[:,:,None], 3, axis=2)]).tobytes())
    encoder.stdin.close()
    if encoder.wait() != 0:
        raise RuntimeError('cutout video encoding failed')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i',
        str(ASSETS/'nurse-station-cutout-packed-20261029.mp4'), '-an', '-c:v',
        'libvpx-vp9', '-crf', '24', '-b:v', '0', '-pix_fmt', 'yuv420p',
        str(ASSETS/'nurse-station-cutout-packed-20261029.webm')], check=True)
    print(f'Prepared {index+1} synchronized color/matte frames; original source unchanged.')
