import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCreationMode, creationModeURL, isTrustedMakeoverEvent, normalizeMakeoverHeight, validateMakeoverSave, forwardMakeoverSave } from '../public/makeover-host.mjs';

test('creation mode accepts only the explicit makeover route', () => {
  assert.equal(resolveCreationMode('?mode=makeover'), 'makeover');
  for (const search of ['', '?mode=cover', '?mode=other', '?mode=MAKEOVER', '?mode=makeover-extra']) assert.equal(resolveCreationMode(search), 'cover');
});
test('mode changes preserve unrelated query parameters and hash', () => {
  assert.equal(creationModeURL('https://example.test/cover.html?x=1&mode=makeover#photo', 'cover'), 'https://example.test/cover.html?x=1#photo');
  assert.equal(creationModeURL('https://example.test/cover.html?x=1#photo', 'makeover'), 'https://example.test/cover.html?x=1&mode=makeover#photo');
});
test('iframe trust requires both exact source and origin, including opaque origins', () => {
  const source = {};
  assert.equal(isTrustedMakeoverEvent({ source, origin: 'https://example.test' }, source, 'https://example.test'), true);
  assert.equal(isTrustedMakeoverEvent({ source: {}, origin: 'https://example.test' }, source, 'https://example.test'), false);
  assert.equal(isTrustedMakeoverEvent({ source, origin: 'https://other.test' }, source, 'https://example.test'), false);
  assert.equal(isTrustedMakeoverEvent({ source, origin: 'null' }, source, 'null'), true);
  assert.equal(isTrustedMakeoverEvent({ source: {}, origin: 'null' }, source, 'null'), false);
  assert.equal(isTrustedMakeoverEvent({ source: null, origin: 'null' }, null, 'null'), false);
});
test('iframe height accepts finite bounded numbers and rounds to layout pixels', () => {
  assert.equal(normalizeMakeoverHeight(300), 300);
  assert.equal(normalizeMakeoverHeight(817.6), 818);
  assert.equal(normalizeMakeoverHeight(10000), 10000);
  for (const value of [299, 10001, Infinity, NaN, '800', null]) assert.equal(normalizeMakeoverHeight(value), null);
});
test('native requests require a bounded id and bare PNG or JPG base64', () => {
  const valid = { type: 'NBO_MAKEOVER_SAVE', id: 'export-1', data: 'iVBORw0KGgo=' };
  assert.deepEqual(validateMakeoverSave(valid), { id: 'export-1', data: 'iVBORw0KGgo=' });
  assert.deepEqual(validateMakeoverSave({ ...valid, data: '/9j/AA==' }), { id: 'export-1', data: '/9j/AA==' });
  for (const override of [{ type: 'OTHER' }, { id: '' }, { id: 123 }, { id: 'x'.repeat(129) }, { data: 'data:image/png;base64,iVBORw0KGgo=' }, { data: 'AAAA' }, { data: 'iVBORw0KGgo=' + 'A'.repeat(90000000) }]) assert.equal(validateMakeoverSave({ ...valid, ...override }), null);
});
test('native forwarding reports saved only for an explicit positive bridge result', async () => {
  const payload = { type: 'NBO_MAKEOVER_SAVE', id: 'save1', data: '/9j/AA==' };
  assert.deepEqual(await forwardMakeoverSave(payload, { postMessage: async ({ action, data }) => ({ saved: action === 'image' && data === '/9j/AA==' }) }), { type: 'NBO_MAKEOVER_SAVE_RESULT', id: 'save1', saved: true });
  for (const bridge of [null, { postMessage: async () => undefined }, { postMessage: async () => ({ diagnostic: 'done' }) }, { postMessage: async () => ({ saved: false }) }, { postMessage: async () => { throw new Error('native failure'); } }]) {
    const result = await forwardMakeoverSave(payload, bridge);
    assert.equal(result.saved, false);
    assert.match(result.error, /[\u4e00-\u9fff]/);
  }
  assert.equal((await forwardMakeoverSave({ ...payload, data: 'bad' }, { postMessage: async () => ({ saved: true }) })).saved, false);
});
