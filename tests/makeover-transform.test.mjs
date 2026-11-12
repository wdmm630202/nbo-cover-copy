import assert from 'node:assert/strict';
import test from 'node:test';
import { coverImage, getPanes, getPhotoTransform, snapPhotoRotation, rotationFromDrag, inversePhotoPoint, projectPhotoPoint } from '../public/makeover/geometry.mjs';

const pane = { x: 10, y: 20, width: 100, height: 200 };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} differs from ${expected}`);

test('default photo transform reproduces the existing centered cover fit', () => {
  const placement = coverImage(pane, 400, 200);
  assert.deepEqual(getPhotoTransform(pane, 400, 200), { centerX: 60, centerY: 120, width: placement.width, height: placement.height, rotationRadians: 0 });
  assert.equal(placement.x, -140);
  assert.equal(placement.y, 20);
});

test('exact-aspect photos translate independently on both pane-percentage axes and zoom out', () => {
  assert.deepEqual(getPhotoTransform(pane, 100, 200, { zoom: 25, offsetX: 50, offsetY: -25 }), { centerX: 110, centerY: 70, width: 25, height: 50, rotationRadians: 0 });
  assert.deepEqual(getPhotoTransform(pane, 100, 200, { zoom: 0 }), { centerX: 60, centerY: 120, width: 0, height: 0, rotationRadians: 0 });
});

test('rotated bounding-box cover preserves the original source aspect ratio', () => {
  const quarterTurn = getPhotoTransform(pane, 400, 200, { rotation: 90 });
  near(quarterTurn.width, 200);
  near(quarterTurn.height, 100);
  near(quarterTurn.rotationRadians, Math.PI / 2);
  const diagonal = getPhotoTransform(pane, 100, 100, { rotation: 45 });
  near(diagonal.width, 141.4213562373095);
  near(diagonal.height, 141.4213562373095);
});

test('the same photo settings scale uniformly between preview and export coordinates', () => {
  const settings = { zoom: 200, offsetX: 25, offsetY: -50, rotation: 90 };
  const preview = getPhotoTransform({ x: 1, y: 2, width: 10, height: 20 }, 400, 200, settings);
  const output = getPhotoTransform(pane, 400, 200, settings);
  near(preview.centerX, 8.5); near(preview.centerY, 2);
  near(preview.width, 40); near(preview.height, 20);
  for (const key of ['centerX', 'centerY', 'width', 'height']) near(output[key], preview[key] * 10);
  near(output.rotationRadians, preview.rotationRadians);
});

test('free transforms clamp to cover control limits and remain finite at edge panes', () => {
  const bounded = getPhotoTransform(pane, 100, 200, { zoom: 999, offsetX: 999, offsetY: -999, rotation: 999 });
  near(bounded.centerX, 260); near(bounded.centerY, -280);
  near(bounded.width, 400); near(bounded.height, 800); near(bounded.rotationRadians, Math.PI);
  assert.deepEqual(getPhotoTransform(pane, 100, 200, { zoom: NaN, offsetX: Infinity, offsetY: NaN, rotation: NaN }), { centerX: 60, centerY: 120, width: 100, height: 200, rotationRadians: 0 });
  for (const split of [0, 1]) for (const edge of getPanes(split)) {
    assert.ok(Object.values(getPhotoTransform(edge, 0, 0, { rotation: -180, offsetX: 200, offsetY: -200 })).every(Number.isFinite));
  }
});

test('rotation snaps integer degrees within three of the reference cardinal angles', () => {
  for (const [input, value, guide] of [[-999, -180, 'horizontal'], [-178, -180, 'horizontal'], [-87, -90, 'vertical'], [-3, 0, 'horizontal'], [3, 0, 'horizontal'], [4, 4, ''], [93, 90, 'vertical'], [94, 94, ''], [178, 180, 'horizontal'], [999, 180, 'horizontal'], [NaN, 0, 'horizontal']]) {
    assert.deepEqual(snapPhotoRotation(input), { value, guide });
  }
  assert.deepEqual(snapPhotoRotation(44.6), { value: 45, guide: '' });
});

test('horizontal rotate drag uses the reference 180 degrees per displayed pane width', () => {
  assert.deepEqual(rotationFromDrag(10, 25, 100), { value: 55, guide: '' });
  assert.deepEqual(rotationFromDrag(0, 50, 100), { value: 90, guide: 'vertical' });
  assert.deepEqual(rotationFromDrag(0, -50, 100), { value: -90, guide: 'vertical' });
  assert.deepEqual(rotationFromDrag(170, 100, 100), { value: 180, guide: 'horizontal' });
  assert.deepEqual(rotationFromDrag(12, 50, 0), { value: 12, guide: '' });
});

test('photo point projection follows canvas clockwise rotation and source normalization', () => {
  const transform = { centerX: 60, centerY: 120, width: 100, height: 200, rotationRadians: Math.PI / 2 };
  const topLeft = projectPhotoPoint(transform, { x: 0, y: 0 });
  near(topLeft.x, 160); near(topLeft.y, 70);
  const inverse = inversePhotoPoint(transform, { x: 160, y: 70 });
  near(inverse.x, 0); near(inverse.y, 0);
});

test('source-space brush anchors roundtrip across translated, zoomed and rotated photos', () => {
  for (const rotation of [-180, -90, -37, 0, 37, 90, 180]) {
    const transform = getPhotoTransform(pane, 400, 200, { zoom: 173, offsetX: 41, offsetY: -29, rotation });
    for (const point of [{ x: 0, y: 0 }, { x: .25, y: .75 }, { x: 1, y: 1 }, { x: -.2, y: 1.1 }]) {
      const projected = projectPhotoPoint(transform, point);
      const inverse = inversePhotoPoint(transform, projected);
      near(inverse.x, point.x); near(inverse.y, point.y);
    }
  }
});

test('zero-size photos project to their finite center and cannot be inverse-mapped', () => {
  const zero = getPhotoTransform(pane, 100, 200, { zoom: 0, rotation: 90 });
  assert.deepEqual(projectPhotoPoint(zero, { x: .25, y: .75 }), { x: 60, y: 120 });
  assert.equal(inversePhotoPoint(zero, { x: 60, y: 120 }), null);
  assert.equal(inversePhotoPoint({ ...zero, width: NaN }, { x: 60, y: 120 }), null);
});
