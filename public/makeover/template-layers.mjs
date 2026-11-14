const KIND = 'nanbo-original-psd-patches';

/** Decode one compact original-pixel atlas; no full 48MP template images. */
export async function loadTemplateLayers(sources, decodeImage) {
  let manifest = sources['atlas-manifest'];
  if (typeof manifest === 'string') manifest = JSON.parse(manifest);
  if (manifest?.version !== 1 || manifest.width !== 6000 || manifest.height !== 8000 || !Array.isArray(manifest.layers?.fixed) || !Array.isArray(manifest.layers?.gradient) || typeof sources.atlas !== 'string') throw new Error('原版模板资源不完整，请更新制作台。');
  const image = await decodeImage(sources.atlas);
  if (image.naturalWidth !== manifest.atlas.width || image.naturalHeight !== manifest.atlas.height || image.naturalWidth * image.naturalHeight > 8_000_000) throw new Error('原版模板尺寸不符，请更新制作台。');
  const make = name => ({ kind: KIND, image, width: 6000, height: 8000, naturalWidth: 6000, naturalHeight: 8000, patches: manifest.layers[name] });
  return { fixed: make('fixed'), gradient: make('gradient') };
}

function visibleBounds(context) {
  const m = context.getTransform(), determinant = m.a * m.d - m.b * m.c;
  if (!determinant) return null;
  const points = [[0, 0], [context.canvas.width, 0], [0, context.canvas.height], [context.canvas.width, context.canvas.height]].map(([x, y]) => ({ x: (m.d * (x - m.e) - m.c * (y - m.f)) / determinant, y: (-m.b * (x - m.e) + m.a * (y - m.f)) / determinant }));
  return { left: Math.min(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), right: Math.max(...points.map(p => p.x)), bottom: Math.max(...points.map(p => p.y)) };
}

function clipCore(context, core) {
  const [x, y, width, height] = core, m = context.getTransform();
  // Template transforms are axis aligned. Adjacent owners use the same snapped
  // device boundary, preventing partial-alpha seams or double compositing.
  context.beginPath();
  if (m.b || m.c || !m.a || !m.d) context.rect(...core);
  else {
    const left = Math.round(x * m.a + m.e), top = Math.round(y * m.d + m.f);
    const right = Math.round((x + width) * m.a + m.e), bottom = Math.round((y + height) * m.d + m.f);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.rect(left, top, right - left, bottom - top);
  }
  context.clip();
  context.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
}

/** Draw in original logical6000×8000 coordinates after caller transforms. */
export function drawTemplateLayer(context, layer) {
  if (layer?.kind !== KIND) { if (layer) context.drawImage(layer, 0, 0, 6000, 8000); return; }
  const bounds = visibleBounds(context);
  if (!bounds) return;
  for (const patch of layer.patches) {
    const [cx, cy, cw, ch] = patch.core;
    if (cx + cw < bounds.left || cy + ch < bounds.top || cx > bounds.right || cy > bounds.bottom) continue;
    context.save();
    try {
      clipCore(context, patch.core);
      const [sx, sy, sw, sh] = patch.source, [dx, dy, dw, dh] = patch.destination;
      if (patch.profile) {
        // This profile is stretched horizontally but may shrink vertically.
        // Avoid anisotropic mipmaps mixing adjacent packed atlas profiles.
        context.imageSmoothingQuality = 'low';
        // Centre columns are exactly identical in the originalPSD. Stretching
        // one original column preserves its entire vertical alpha profile.
        for (const [sourceX, sourceWidth, destinationX, destinationWidth, ownerX, ownerWidth] of [
          [sx, 4, 0, 4, 0, 3], [sx + 4, 1, 3, 5994, 3, 5994], [sx + 5, 4, 5996, 4, 5997, 3],
        ]) {
          context.save();
          try {
            clipCore(context, [ownerX, cy, ownerWidth, ch]);
            context.drawImage(layer.image, sourceX, sy, sourceWidth, sh, destinationX, dy, destinationWidth, dh);
          } finally { context.restore(); }
        }
      } else context.drawImage(layer.image, sx, sy, sw, sh, dx, dy, dw, dh);
    } finally { context.restore(); }
  }
}
