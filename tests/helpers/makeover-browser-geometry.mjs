import assert from 'node:assert/strict';

function locatorInFrame(frame, locatorOrSelector) {
  return typeof locatorOrSelector === 'string' ? frame.locator(locatorOrSelector) : locatorOrSelector;
}

async function frameGeometry(frame) {
  const viewport = await frame.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const element = await frame.frameElement();
  try {
    return await element.evaluate((iframe, viewport) => {
      const rect = iframe.getBoundingClientRect();
      // getBoundingClientRect includes the parent's CSS zoom, whereas the
      // iframe's own viewport and client dimensions remain logical pixels.
      const borderScaleX = rect.width / iframe.offsetWidth;
      const borderScaleY = rect.height / iframe.offsetHeight;
      return {
        x: rect.x + iframe.clientLeft * borderScaleX,
        y: rect.y + iframe.clientTop * borderScaleY,
        scaleX: iframe.clientWidth * borderScaleX / viewport.width,
        scaleY: iframe.clientHeight * borderScaleY / viewport.height,
      };
    }, viewport);
  } finally { await element.dispose(); }
}

/** A child locator's visible box in top-level physical mouse coordinates.
 * Playwright's built-in iframe boundingBox currently omits ancestor CSS zoom.
 */
export async function frameBoundingBox(frame, locatorOrSelector) {
  const locator = locatorInFrame(frame, locatorOrSelector);
  let box = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (!rect.width || !rect.height || style.display === 'none' || style.visibility === 'hidden') return null;
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  if (!box) return null;
  for (let current = frame; current.parentFrame(); current = current.parentFrame()) {
    const geometry = await frameGeometry(current);
    box = {
      x: geometry.x + box.x * geometry.scaleX,
      y: geometry.y + box.y * geometry.scaleY,
      width: box.width * geometry.scaleX,
      height: box.height * geometry.scaleY,
    };
  }
  return box;
}

/** Click the actual visible control, including editors inside a zoomed shell. */
export async function clickInFrame(page, frame, locatorOrSelector) {
  const locator = locatorInFrame(frame, locatorOrSelector);
  await locator.waitFor({ state: 'visible' });
  await locator.scrollIntoViewIfNeeded();
  const reachable = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { hit: hit === element || element.contains(hit), disabled: element.matches(':disabled'), x, y };
  });
  assert.ok(reachable.hit && !reachable.disabled,
    `真实点击的iframe控件必须可用且未被遮挡 ${JSON.stringify(reachable)}`);
  const box = await frameBoundingBox(frame, locator);
  assert.ok(box && box.width > 0 && box.height > 0, '真实点击的iframe控件必须具有可见边界');
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  assert.ok(await page.evaluate(({ x, y }) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight, point),
    `真实点击必须落在顶层窗口内 ${JSON.stringify(point)}`);
  await page.mouse.click(point.x, point.y);
}
