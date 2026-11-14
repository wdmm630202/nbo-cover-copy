#!/usr/bin/env python3
"""Losslessly repack original PSD artwork; generated files are committed for CI.

No resizing, recolouring or reconstruction of the PSD gradient occurs. Empty
fixed-artwork regions are omitted; retained patches include sampling halos.
"""
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public/makeover/assets'
SIZE = (6000, 8000)
HALO = 8
CELL = 256


def overlap(a, b):
    return a[0] < b[0] + b[2] and b[0] < a[0] + a[2] and a[1] < b[1] + b[3] and b[1] < a[1] + a[3]


def contains(a, b):
    return a[0] <= b[0] and a[1] <= b[1] and a[0] + a[2] >= b[0] + b[2] and a[1] + a[3] >= b[1] + b[3]


def pack(items, width, height):
    free = [(0, 0, width, height)]
    positions = {}
    for index in sorted(range(len(items)), key=lambda i: (max(items[i]['image'].size), items[i]['image'].width * items[i]['image'].height), reverse=True):
        w, h = items[index]['image'].size
        fits = [(min(r[2] - w, r[3] - h), max(r[2] - w, r[3] - h), j) for j, r in enumerate(free) if w <= r[2] and h <= r[3]]
        if not fits:
            return None
        _, _, best = min(fits)
        used = (free[best][0], free[best][1], w, h)
        positions[index] = used
        split = []
        for r in free:
            if not overlap(r, used):
                split.append(r)
                continue
            x, y, rw, rh = r
            ux, uy, uw, uh = used
            if ux > x:
                split.append((x, y, ux - x, rh))
            if ux + uw < x + rw:
                split.append((ux + uw, y, x + rw - ux - uw, rh))
            if uy > y:
                split.append((x, y, rw, uy - y))
            if uy + uh < y + rh:
                split.append((x, uy + uh, rw, y + rh - uy - uh))
        free = [r for i, r in enumerate(split) if r[2] > 0 and r[3] > 0 and not any(i != j and contains(other, r) and (other != r or j < i) for j, other in enumerate(split))]
    return positions


def main():
    originals = {name: Image.open(ASSETS / f'template-{name}.png').convert('RGBA') for name in ['fixed', 'gradient']}
    assert all(image.size == SIZE for image in originals.values())
    fixed, gradient = originals['fixed'], originals['gradient']
    alpha = fixed.getchannel('A')
    items = []
    for y in range(0, SIZE[1], CELL):
        for x in range(0, SIZE[0], CELL):
            right, bottom = min(SIZE[0], x + CELL), min(SIZE[1], y + CELL)
            expanded = (max(0, x - HALO), max(0, y - HALO), min(SIZE[0], right + HALO), min(SIZE[1], bottom + HALO))
            bounds = alpha.crop(expanded).getbbox()
            if not bounds:
                continue
            # Include adjacent pixels even for an otherwise empty owned core;
            # they can contribute to scaled antialiasing at the cell boundary.
            crop = (max(0, expanded[0] + bounds[0] - HALO), max(0, expanded[1] + bounds[1] - HALO), min(SIZE[0], expanded[0] + bounds[2] + HALO), min(SIZE[1], expanded[1] + bounds[3] + HALO))
            items.append({'layer': 'fixed', 'image': fixed.crop(crop), 'destination': [crop[0], crop[1], crop[2] - crop[0], crop[3] - crop[1]], 'core': [x, y, right - x, bottom - y]})

    gradient_alpha = gradient.getchannel('A')
    gradient_visible = gradient_alpha.point(lambda value: 255 if value else 0)
    for channel in 'RGB':
        assert ImageChops.multiply(gradient.getchannel(channel), gradient_visible).getbbox() is None, 'Visible original PSD gradient pixels must remain black.'
    # Photoshop keeps unrelated RGB under some zero-alpha pixels. Canvas drops
    # those invisible channels; the exact original alpha remains unchanged.
    zero = Image.new('L', SIZE)
    gradient = Image.merge('RGBA', (zero, zero, zero, gradient_alpha))
    center = gradient.crop((3000, 0, 3001, 8000))
    assert ImageChops.difference(gradient.crop((3, 0, 5997, 8000)), center.resize((5994, 8000), Image.Resampling.NEAREST)).getbbox() is None
    # Left three edge columns, three duplicate centre columns (sampling halo),
    # and right three edge columns encode every original pixel exactly.
    profile = Image.new('RGBA', (9, 8000))
    profile.paste(gradient.crop((0, 0, 3, 8000)), (0, 0))
    for column in [3, 4, 5]:
        profile.paste(center, (column, 0))
    profile.paste(gradient.crop((5997, 0, 6000, 8000)), (6, 0))
    for y in range(0, 8000, 512):
        bottom = min(8000, y + 512)
        top_halo, bottom_halo = max(0, y - HALO), min(8000, bottom + HALO)
        items.append({'layer': 'gradient', 'image': profile.crop((0, top_halo, 9, bottom_halo)), 'profile': True, 'destination': [0, top_halo, 6000, bottom_halo - top_halo], 'core': [0, y, 6000, bottom - y]})

    packed = None
    for height in range(1792, 3073, 64):
        packed = pack(items, 2048, height)
        if packed:
            break
    if packed is None:
        raise RuntimeError('Cannot fit exact original artwork into a bounded atlas')
    used_height = max(rect[1] + rect[3] for rect in packed.values())
    atlas = Image.new('RGBA', (2048, used_height))
    layers = {'fixed': [], 'gradient': []}
    for index, item in enumerate(items):
        rect = packed[index]
        atlas.paste(item['image'], rect[:2])
        patch = {'source': list(rect), 'destination': item['destination'], 'core': item['core']}
        if item.get('profile'):
            patch['profile'] = True
        layers[item['layer']].append(patch)
    atlas_path = ASSETS / 'template-atlas.png'
    atlas.save(atlas_path, optimize=True)
    metadata = {'version': 1, 'width': SIZE[0], 'height': SIZE[1], 'atlas': {'width': atlas.width, 'height': atlas.height, 'sha256': hashlib.sha256(atlas_path.read_bytes()).hexdigest()}, 'halo': HALO, 'originals': {name: hashlib.sha256((ASSETS / f'template-{name}.png').read_bytes()).hexdigest() for name in originals}, 'layers': layers}
    (ASSETS / 'template-atlas.json').write_text(json.dumps(metadata, separators=(',', ':')) + '\n')

    # Exact raw verification for gradient; visible pixels of fixed artwork.
    rebuilt_gradient = Image.new('RGBA', SIZE)
    for patch in layers['gradient']:
        sx, sy, sw, sh = patch['source']
        _, dy, _, dh = patch['destination']
        _, cy, _, ch = patch['core']
        strip = atlas.crop((sx, sy + cy - dy, sx + sw, sy + cy - dy + ch))
        rebuilt_gradient.paste(strip.crop((0, 0, 3, ch)), (0, cy))
        rebuilt_gradient.paste(strip.crop((4, 0, 5, ch)).resize((5994, ch), Image.Resampling.NEAREST), (3, cy))
        rebuilt_gradient.paste(strip.crop((6, 0, 9, ch)), (5997, cy))
    assert ImageChops.difference(gradient, rebuilt_gradient).getbbox() is None
    rebuilt_fixed = Image.new('RGBA', SIZE)
    for patch in layers['fixed']:
        sx, sy, _, _ = patch['source']
        dx, dy, _, _ = patch['destination']
        cx, cy, cw, ch = patch['core']
        # Paste only the owned intersection; preserve original hidden RGB in
        # retained crops without double compositing their sampling halos.
        left, top = max(cx, dx), max(cy, dy)
        right, bottom = min(cx + cw, dx + patch['destination'][2]), min(cy + ch, dy + patch['destination'][3])
        if right > left and bottom > top:
            rebuilt_fixed.paste(atlas.crop((sx + left - dx, sy + top - dy, sx + right - dx, sy + bottom - dy)), (left, top))
    assert ImageChops.difference(fixed.getchannel('A'), rebuilt_fixed.getchannel('A')).getbbox() is None
    visible = alpha.point(lambda value: 255 if value else 0)
    for channel in 'RGB':
        assert ImageChops.multiply(ImageChops.difference(fixed.getchannel(channel), rebuilt_fixed.getchannel(channel)), visible).getbbox() is None
    print(json.dumps({'dimensions': atlas.size, 'decodedBytes': atlas.width * atlas.height * 4, 'pngBytes': atlas_path.stat().st_size, 'fixedPatches': len(layers['fixed']), 'gradientPatches': len(layers['gradient']), 'exactOriginalGradientAlpha': True, 'exactGradientVisibleRgba': True, 'exactFixedVisibleRgba': True}))


if __name__ == '__main__':
    main()
