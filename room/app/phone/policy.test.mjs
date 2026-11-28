import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createPhoneFrameMonitor, withinPhoneSceneCaps } from './policy.mjs';

const caps = { max_figures: 4, max_draw_calls: 15, max_triangles: 200 };
const atCaps = { figures_drawn: 4, draw_calls: 15, triangles: 200 };

test('a frame at all three caps fits', () => {
  assert.equal(withinPhoneSceneCaps(atCaps, caps), true);
});

for (const [counter, overflow] of [
  ['figures_drawn', 5],
  ['draw_calls', 16],
  ['triangles', 201],
]) {
  test(`a frame over the ${counter} cap exceeds the budget`, () => {
    assert.equal(withinPhoneSceneCaps({ ...atCaps, [counter]: overflow }, caps), false);
  });
}

test('zero is a valid count and cap', () => {
  assert.equal(
    withinPhoneSceneCaps(
      { ...atCaps, figures_drawn: 0 },
      { ...caps, max_figures: 0 },
    ),
    true,
  );
});

test('a missing or invalid measurement or cap cannot fit the budget', () => {
  for (const value of [undefined, NaN, Infinity, -1, 1.5, '1', null]) {
    assert.equal(withinPhoneSceneCaps({ ...atCaps, figures_drawn: value }, caps), false);
    assert.equal(withinPhoneSceneCaps(atCaps, { ...caps, max_draw_calls: value }), false);
  }
  assert.equal(withinPhoneSceneCaps(undefined, caps), false);
  assert.equal(withinPhoneSceneCaps(atCaps, null), false);
});

test('fall back at exactly three continuous seconds below 30 FPS', () => {
  const monitor = createPhoneFrameMonitor();
  assert.equal(monitor.observe(0, 29.9), false);
  assert.equal(monitor.observe(1_000, 29), false);
  assert.equal(monitor.observe(2_000, 29), false);
  assert.equal(monitor.observe(2_999, 29), false);
  assert.equal(monitor.observe(3_000, 29), true);
});

test('30 FPS clears a dip before another three-second window can start', () => {
  const monitor = createPhoneFrameMonitor();
  assert.equal(monitor.observe(100, 29), false);
  assert.equal(monitor.observe(2_100, 29), false);
  assert.equal(monitor.observe(3_100, 30), false);
  assert.equal(monitor.observe(3_200, 29), false);
  assert.equal(monitor.observe(5_200, 29), false);
  assert.equal(monitor.observe(6_200, 29), true);
});

test('a reading after a clock reset starts a fresh dip', () => {
  const monitor = createPhoneFrameMonitor();
  assert.equal(monitor.observe(1_000, 29), false);
  assert.equal(monitor.observe(3_000, 29), false);
  assert.equal(monitor.observe(500, 29), false);
  assert.equal(monitor.observe(3_499, 29), false);
  assert.equal(monitor.observe(3_500, 29), true);
});

test('an invalid sample interrupts a below-floor interval', () => {
  for (const [timestamp, fps] of [[2_500, NaN], [2_500, -1], [Infinity, 29]]) {
    const monitor = createPhoneFrameMonitor();
    assert.equal(monitor.observe(0, 29), false);
    assert.equal(monitor.observe(timestamp, fps), false);
    assert.equal(monitor.observe(3_000, 29), false);
    assert.equal(monitor.observe(6_000, 29), true);
  }
});

test('monitors keep separate below-floor intervals', () => {
  const first = createPhoneFrameMonitor();
  const second = createPhoneFrameMonitor();
  assert.equal(first.observe(0, 29), false);
  assert.equal(second.observe(3_000, 29), false);
  assert.equal(first.observe(3_000, 29), true);
});
